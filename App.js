Ext.define('ForecastAccuracy', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
    progressField: 'AcceptedLeafStoryCount',

    config: {
        defaultSettings: {
            fetchLimit: 100,
            EndDate: new Date(),
            StartDate: new Date(Ext.Date.now()-7776000000),
            removeOutliers: true
        }
    },
    items: [
        {
            xtype:'container',
            itemId: 'chartBox',
            layout: 'hbox'
        }
    ],

    getSettingsFields: function () {
        return [
            {
                xtype: 'rallyportfolioitemtypecombobox',
                name: 'piType',
                label: ' Portfolio Type',
                labelWidth: 200,
                valueField: 'TypePath'
            },
            {
                xtype: 'rallynumberfield',
                name: 'fetchLimit',
                label: 'Max Fetch Limit',
                labelWidth: 200,
                maxValue: 200,
                minValue: 0,
                allowDecimals: false
            },
            {
                xtype: 'rallydatefield',
                name: 'StartDate',
                fieldLabel: 'Start Date',
                labelWidth: 200,
                format: 'F j, Y',

            },
            {
                xtype: 'rallydatefield',
                name: 'EndDate',
                labelWidth: 200,
                fieldLabel: 'End Date',
                format: 'F j, Y',
            },{
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Remove outliers',
                name: 'removeOutliers'
            }
        ];

    },

    launch: function() {
        this.showMask('Fetching items with historical data...');
        //Fetch all the portfolio items of interest that have completed dates with the settings limits

        this.model = this.getSetting('piType') || 'Portfolioitem/Feature';
        this.start = new Date(this.getSetting('StartDate') || Ext.Date.now()-7776000000);
        this.end   = new Date(this.getSetting('EndDate') || Ext.Date.now());
        this._fetchItems();

    },

    onSettingsUpdate: function() {
        //Here we might have some old stuff, so remove/clear before calling the fetch
        this._clearStatus();
        this._fetchItems();
    },

    _clearStatus: function() {
        if (this.store) { this.store.destroy(); }
    },

    showMask: function(msg) {
        if ( this.getEl() ) { 
            this.getEl().unmask();
            this.getEl().mask(msg);
        }
    },
    hideMask: function() {
        if ( this.getEl()) {this.getEl().unmask();}
    },

    _fetchItems() {
        var me = this;
        me.store = Ext.create('Rally.data.wsapi.Store', {
            model: me.model,
            pageSize: me.getSetting('fetchLimit') || 200,
            fetch: ['ObjectID', 'FormattedID','PreliminaryEstimate', 'RefinedEstimate', 'LeafStoryCount',
                'LeafStoryPlanEstimateTotal', 'PreliminaryEstimateValue', 'ActualStartDate',
                'ActualEndDate', 'PlannedStartDate', 'PlannedEndDate'], 
            autoLoad: true,
            filters: [
                {
                    property: 'ActualEndDate',
                    operator: '<',
                    value: me.end
                },
                {
                    property: 'ActualEndDate',
                    operator: '>',
                    value: me.start
                }
            ],
            limit: me.getSetting('fetchLimit') || Infinity,
            listeners: {
                load: function(store,records,status) {
                    if (!status) {
                        me.hideMask();
                        return;
                    }
                    //Now we have headline list of items, so fetch historic data plot daily positions
                    if ( store.getCount()){
                        Rally.ui.notify.Notifier.show({
                            message: 'Fetched ' + store.getCount() + ' (of ' +
                                store.totalCount + ') Items',
                            timeout: 5000
                        });
                        /* Get metrics from WSAPI info
                            E.g. PreliminaryEstimate vs LeafStoryPlanEstimateTotal
                        */

                        me._doSizeMetrics(records);
                        me._doDateMetrics(records);
                        me._doRateMetrics(records);
                        me.hideMask();

                        //Find the artefact with the longest duration from the filtered data set
                        // var histData = [];
                        // me.fetchedCount = 0;
                        // var promises = [];
                        // var i = 0,j = 0;
                        // for ( i = 0; i < records.length; i++) {
                        //     promises.push (me._getHistoricalData(records[i], me));
                        // }
                        // Deft.Promise.all(promises).then({
                        //     success: function(storeList) {
                        //         //Scan through all the stores looking for metrics
                        //         for (j = 0; j < storeList.length; j++) {
                        //             var wsapiRecord = me.store.findRecord('ObjectID', 
                        //                 storeList[j].data.items[0].get('ObjectID'));
                        //         }
                        //         me.hideMask();
                        //     },
                        //     failure: function() {
                        //         debugger;
                        //     }
                        // });
                    }
                    else {
                        //Nothing found
                        Rally.ui.notify.Notifier.showWarning({
                            message: 'No Historical Data found within date range'
                        });
                        me.hideMask();
                    }
                }
            }
        });
    },
    _getHistoricalData: function(record, me) {

        var deferred = new Deft.Deferred();

        var query =
            Ext.merge({
                'ObjectID' : record.get("ObjectID")
            }, me._getProgressField());


        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad: true,
            limit: Infinity,
            compress: true,
            removeUnauthorizedSnapshots: true,
            pageSize: 2000, //Had issues with some apps going "barf!" at me
            listeners: {
                load: function(store, data, success) {
                    if (!success) { deferred.reject();}
                    else {
                        me.showMask('Fetched change records for ' + (++me.fetchedCount) + ' items');
                        deferred.resolve(store);
                    }
                }
            },
            fetch: ['FormattedID','ObjectID', '_ValidTo', '_ValidFrom', me.progressField],
            find: query,
            sort: { "_ValidFrom": 1 }
        });
        return deferred.getPromise();

    },

    _getProgressField: function() {
        return {};
    },

    _doSizeMetrics: function(records){
        //Going to plot bellcurves
        var sizeMetrics = [];
        for ( var k = 0; k < records.length; k++) {
            if ( records[k].get('PreliminaryEstimate')) {
                 sizeMetrics.push( {
                     groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                     x: records[k].get('PreliminaryEstimateValue'),
                     y: (records[k].get('LeafStoryPlanEstimateTotal')/records[k].get('PreliminaryEstimateValue'))* 100.0,
                     name: records[k].get('FormattedID')
                 });
            }
        }
        sizeMetrics = _.sortBy(sizeMetrics, ['x']);
        this._updateSizeMetricsChart(sizeMetrics);
     },

    _updateSizeMetricsChart: function(sizeMetrics) {
        if (this.down('#sizeMetricsChart')){ this.down('#sizeMetricsChart').destroy();}
        this._drawChart('sizeMetricsChart', 
            'Size Prediction Accuracy', 
            'Actual vs Predicted Percentage ( Size )',
            sizeMetrics
        );
    },

    _doDateMetrics: function(records) {                         
        var dateMetrics = [];
        for ( var k = 0; k < records.length; k++) {
             var asd = records[k].get('ActualStartDate'),
                 aed = records[k].get('ActualEndDate'),
                 psd = records[k].get('PlannedStartDate'),
                 ped = records[k].get('PlannedEndDate'),
                 pre = records[k].get('PreliminaryEstimate');
             if (pre) {
                 if (asd && aed && psd && ped) {
                     
                     var percent = (new Date(aed) -  new Date(asd))/
                                     (new Date(ped) -  new Date(psd)) * 100.0;
                     dateMetrics.push( {
                         groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                         x: records[k].get('PreliminaryEstimateValue'),
                         y: percent,
                         name: records[k].get('FormattedID')
                     });
                 } else {
                     dateMetrics.push ( {
                         groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                         x: records[k].get('PreliminaryEstimateValue'),
                         y: 0,
                         name: records[k].get('FormattedID')
                     });
                 }
             }
         }
         dateMetrics = _.sortBy(dateMetrics, ['x']);
         this._updateDateMetricsChart(dateMetrics);

    },

    _updateDateMetricsChart: function(dateMetrics) {
        if (this.down('#dateMetricsChart')){ this.down('#dateMetricsChart').destroy();}
        this._drawChart('dateMetricsChart', 
            'Duration Prediction Accuracy', 
            'Actual vs Predicted Percentage ( Duration )',
            dateMetrics
        );
    },

    _doRateMetrics: function(records) {
        //Story point delivery metrics
        var rateMetrics = [];
        for ( var k = 0; k < records.length; k++) {
            var asd = records[k].get('ActualStartDate'),
                aed = records[k].get('ActualEndDate'),
                pre = records[k].get('PreliminaryEstimate');
            if (pre) {
                if (asd && aed) {
                    //Rate per week
                    var rate = (records[k].get('LeafStoryPlanEstimateTotal')* 604800000)/(new Date(aed) -  new Date(asd));
                    if (rate < 100) {  //Feature teams shouldn't be doing more than this. Famous last words.....
                    //Usually a high rate figure is caused by someone fiddling the dates/sizes due to poor practices
                    rateMetrics.push( {
                        groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                        x: records[k].get('PreliminaryEstimateValue'),
                        y: rate,
                        name: records[k].get('FormattedID')
                    });
                    }
                } else {
                    rateMetrics.push ( {
                        groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                        x: records[k].get('PreliminaryEstimateValue'),
                        y: 0,
                        name: records[k].get('FormattedID')
                    });
                }
            }
        }
        rateMetrics = _.sortBy(rateMetrics, ['x']);
        this._updateRateMetricsChart(rateMetrics);
                         
    },

    _updateRateMetricsChart: function(rateMetrics) {
        if (this.down('#rateMetricsChart')){ this.down('#rateMetricsChart').destroy();}
        this._drawChart('rateMetricsChart',
            'Story Points Delivery',
            'Points per Week', 
            rateMetrics
        );
    },

    _drawChart: function(id, title, yAxis, data) {
        var me = this;

        //Some data points may be erroneous, so let's take the 10% to 90% data points
        if (this.getSetting('removeOutliers')) {
            data = _.sortBy(data, 'y');
            var dataLen = data.length;
            data = _.initial(_.rest(data, 
                Math.floor(dataLen * 0.1)) || 1,
                Math.ceil(dataLen * 0.1) || 1
            );
        }

        data = _.sortBy(data, 'x');
        //Group by name so that we can create a number of series for the plot
        var groups = _.groupBy(data, 'groupBy');
        var seriesData = [];

        //Then... re-extract in the right format
        _.each(Object.keys(groups), function(group) {
            var plotData = [];
            _.each(groups[group], function(point) {
                plotData.push(point);
            });
            seriesData.push ( {
                name: group,    //To get the legend
                data: plotData,
            });
        });
        var opacity = 1/Math.log1p(data.length);
        me.down('#chartBox').add( {
            xtype: 'rallychart',
            width: '33%',
            height: 600,
            loadMask: false,
            itemId: id,
            // chartColors: 
                // ['rgba(27,158,119,0.4)','rgba(217,95,2,0.4)','rgba(117,112,179,0.4)','rgba(231,41,138)',
                //  'rgba(102,166,30,0.4)','rgba(230,171,2,0.4)','rgba(166,118,29,0.4)','rgba(102,102,102,0.4)'],

                 chartColors: [
                    'rgba(27,158,119,' + opacity + ')',
                    'rgba(217,95,2,' + opacity + ')',
                    'rgba(117,112,179,' + opacity + ')',
                    'rgba(231,41,138,' + opacity + ')',
                    'rgba(102,166,30,' + opacity + ')',
                    'rgba(230,171,2,' + opacity + ')',
                    'rgba(166,118,29,' + opacity + ')',
                    'rgba(102,102,102,' + opacity + ')'
                ],
    
            chartConfig: {
                chart: {
                    type: 'scatter',
                },
                title: { 
                    text: title + ' (' + data.length + ' items)',                    
                },
                xAxis: {
                    title: { text: 'PreliminaryEstimate Value of ' + me.getSetting('piType')},
                    type: 'logarithmic'
                },
                yAxis: {
                    title: { text: yAxis},
                    type: 'logarithmic'
                },
                tooltip: {
                    formatter: function() { 
                        var str = "<span>" +  this.point.name + "</span>";
                        str += "<table>";
                        str += "<tr>";
                        str += "<td>" + me.store.findRecord('FormattedID', this.point.name).get('_refObjectName') + "</td>";
                        str += "</tr>";
                        str += "</table>";
                        return str;
                    },
                    shared: true,
                    useHTML: true
                },
                plotOptions: {
                    scatter: {
                        marker: {
                            radius: 6,
                        }
                    },
                }
            },

            chartData: {
                series: seriesData,
            }
        });
    },
});
