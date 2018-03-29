Ext.define('ForcastAccuracy', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
    progressField: 'AcceptedLeafStoryCount',

    config: {
        defaultSettings: {
            fetchLimit: 100,
            EndDate: new Date(),
            StartDate: new Date(Ext.Date.now()-7776000000)
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
                minValue: 1,
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
            listeners: {
                load: function(store,records,status) {
                    if (!status) {
                        me.hideMask();
                        return;
                    }
                    //Now we have headline list of items, so fetch historic data plot daily positions
                    if ( store.getCount()){
                        Rally.ui.notify.Notifier.show({
                            message: 'Working with ' + store.getCount() + ' (of ' +
                                store.totalCount + ') Historical Data Items',
                            timeout: 5000
                        });
                        /* Get metrics from WSAPI info
                            E.g. PreliminaryEstimate vs LeafStoryPlanEstimateTotal
                        */

                       //Going to plot bellcurves
                       me.sizeMetrics = [];
                       var k =0;
                       for ( k = 0; k < store.getCount(); k++) {
                           if ( records[k].get('PreliminaryEstimate')) {
                                me.sizeMetrics.push( {
                                    groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                                    x: records[k].get('PreliminaryEstimateValue'),
                                    y: (records[k].get('LeafStoryPlanEstimateTotal')/records[k].get('PreliminaryEstimateValue'))* 100.0,
                                    name: records[k].get('FormattedID')
                                });
                           }
                       }
                       me.sizeMetrics = _.sortBy(me.sizeMetrics, ['x']);
                       me._updateSizeMetricsChart();

                       me.dateMetrics = [];
                       for ( k = 0; k < store.getCount(); k++) {
                            var asd = records[k].get('ActualStartDate'),
                                aed = records[k].get('ActualEndDate'),
                                psd = records[k].get('PlannedStartDate'),
                                ped = records[k].get('PlannedEndDate'),
                                pre = records[k].get('PreliminaryEstimate');
                            if (pre) {
                                if (asd && aed && psd && ped) {
                                    
                                    var percent = (new Date(aed) -  new Date(asd))/
                                                    (new Date(ped) -  new Date(psd)) * 100.0;
                                    me.dateMetrics.push( {
                                        groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                                        x: records[k].get('PreliminaryEstimateValue'),
                                        y: percent,
                                        name: records[k].get('FormattedID')
                                    });
                                } else {
                                    me.dateMetrics.push ( {
                                        groupBy: records[k].get('PreliminaryEstimate')._refObjectName,
                                        x: records[k].get('PreliminaryEstimateValue'),
                                        y: 0,
                                        name: records[k].get('FormattedID')
                                    });
                                }
                            }
                        }
                        me.dateMetrics = _.sortBy(me.dateMetrics, ['x']);
                        me._updateDateMetricsChart();
                        me.hideMask();

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

    _updateSizeMetricsChart: function() {
        if (this.down('#sizeMetricsChart')){ this.down('#sizeMetricsChart').destroy();}
        this._drawChart('sizeMetricsChart', 'Size', this.sizeMetrics);
    },

    _updateDateMetricsChart: function() {
        if (this.down('#dateMetricsChart')){ this.down('#dateMetricsChart').destroy();}
        this._drawChart('dateMetricsChart', 'Duration', this.dateMetrics);
    },

    _drawChart: function(id, title, data) {
        var me = this;
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
        me.down('#chartBox').add( {
            xtype: 'rallychart',
            width: '50%',
            height: 600,
            loadMask: false,
            itemId: id,
            chartColors: 
                ['rgba(27,158,119,0.4)','rgba(217,95,2,0.4)','rgba(117,112,179,0.4)','rgba(231,41,138)',
                 'rgba(102,166,30,0.4)','rgba(230,171,2,0.4)','rgba(166,118,29,0.4)','rgba(102,102,102,0.4)'],
            chartConfig: {
                chart: {
                    type: 'scatter',
                },
                title: { 
                    text: title + ' Prediction Accuracy',                    
                },
                xAxis: {
                    title: { text: 'PreliminaryEstimate Value of ' + me.getSetting('piType')},
                    type: 'logarithmic'
                },
                yAxis: {
                    title: { text: 'Actual vs Predicted Percentage (' + title + ')'},
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
