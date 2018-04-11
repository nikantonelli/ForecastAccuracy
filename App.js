Ext.define('ForecastAccuracy', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
    config: {
        defaultSettings: {
            fetchLimit: 100,
            EndDate: new Date(),
            plotDate: new Date(),
            StartDate: new Date(Ext.Date.now()-7776000000),
            removeOutliers: true,
//            plotItemSize: 'M' //Leave this blank  - localhost debugging
        }
    },
    items: [
        {
            xtype:'container',
            itemId: 'chartBox',
            layout: 'hbox'
        },{
            xtype:'container',
            itemId: 'mcBox',
            layout: 'vbox'
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
                xtype: 'rallycombobox',
                name: 'plotItemSize',
                label: ' Item Size for MC Plot',
                labelWidth: 200,
                allowClear: true,
                storeConfig: {
                    pageSize: 200,
                    limit: Infinity,
                    model: 'PreliminaryEstimate',
                    sorters: [
                        {
                            property: 'Value',
                            direction: 'ASC'
                        }
                    ]
                },
                valueField: 'Name'
            },
            {
                xtype: 'rallydatefield',
                name: 'plotDate',
                fieldLabel: 'MC Plot Date',
                labelWidth: 200,
                format: 'F j, Y',

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
                fieldLabel: 'History Start Date',
                labelWidth: 200,
                format: 'F j, Y',

            },
            {
                xtype: 'rallydatefield',
                name: 'EndDate',
                labelWidth: 200,
                fieldLabel: 'History End Date',
                format: 'F j, Y',
            },{
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Remove outliers',
                name: 'removeOutliers'
            }
        ];

    },

    launch: function() {
        this.showMask('Fetching data for completed items...');
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
            fetch: [
                'ObjectID', 'FormattedID','PreliminaryEstimate', 'RefinedEstimate', 'LeafStoryCount',
                'LeafStoryPlanEstimateTotal', 'PreliminaryEstimateValue', 'ActualStartDate',
                'ActualEndDate', 'PlannedStartDate', 'PlannedEndDate'
            ], 
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
                },
                {
                    property: 'PreliminaryEstimate.ObjectID',
                    operator: '!=',
                    value: null
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

                        // Get metrics from LBAPI info
                        me.fetchedCount = 0;
                        var promises = [];
                        var i = 0;
                        for ( i = 0; i < records.length; i++) {
                            //If no plot sizing specified, then show them all.
            
                            if (!me.getSetting('plotItemSize') || (records[i].get('PreliminaryEstimate')._refObjectName === me.getSetting('plotItemSize'))) {
                                promises.push (me._getHistoricalData(records[i], me));
                            }
                        }
                        Deft.Promise.all(promises).then({
                            success: function(seriesList) {
                                me.hideMask();
                                seriesList = _.filter(seriesList, function(series) { return series.data.length > 0;});
                                console.log(seriesList);
                                //Scan the list of series and work out the numbers completed per period
                                //First we need the scope of the date range. We have the start already, now we
                                //need to know the max
                                me._addCompletionSpline(seriesList,me);
                                me._drawMcChart(seriesList, me);
                            },
                            failure: function() {
                                console.log('Oops!');
                            },
                            scope: me
                        });
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

    _addCompletionSpline: function(seriesList, me) {

        var firstDate = new Date(me.getSetting('plotDate')).valueOf();
        var lastDate = firstDate;
        _.each(seriesList, function(series) {
            if (series.data[series.data.length - 1][0] > lastDate){ 
                lastDate = series.data[series.data.length - 1][0];
            }
        });
        //Now, we can skip along the series array in steps and create a spline curve
        var dateStep = (lastDate - firstDate) / 10;
        var splineSeries = {
            name: 'Completed This Period',
            type: 'spline',
            yAxis: 1,
            color: '#0f0fff',
            data: []
        };
        
        for ( ; firstDate < lastDate; firstDate += dateStep){
            splineSeries.data.push( [
                firstDate + (dateStep/2),
                me._findCompletionBetween( seriesList, firstDate, firstDate + dateStep)
            ]);
        }
        seriesList.push(splineSeries);

    },

    _findCompletionBetween: function(seriesList, startDate, endDate) {
        var total = 0;
        _.each(seriesList, function (series) {
            var lastDate =  new Date(series.data[series.data.length - 1][0]);
            total += ((lastDate > startDate) && (lastDate <= endDate))?1:0;
        });
        return total;
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
                        var series = {
                                name: data[0].get('FormattedID'),
                                type: 'line',
                                data: me._createMcSeries(data, me)
                        };
                        deferred.resolve(series);
                    }
                },
                scope: me
            },
            fetch: [
                'FormattedID',
                'ObjectID', 
                '_ValidTo', 
                '_ValidFrom', 
                'LeafStoryPlanEstimateTotal', 
                'AcceptedLeafStoryPlanEstimateTotal'
            ],
            find: query,
            sort: { "_ValidFrom": 1 }
        });
        return deferred.getPromise();

    },
    _createMcSeries: function(data, me ) {
        var series = [];
        data = me._trimNonZero(data); //Initial creation can cause a record at the start
        var startDate = new Date();
        if (me.getSetting('plotDate')) { startDate = new Date(me.getSetting('plotDate')); }
        for (var i = 0; i < data.length; i++){
            var finalValue = 0;
            //If we have reached the last entry for AcceptedLeafStoryPlanEstimate, we need to keep track of that
            if (new Date(data[i].get('_ValidTo')).getFullYear() === 9999) { finalValue = data[i].get('_ValidFrom');}

                var timeStamp =  startDate.valueOf() + 
                    new Date((finalValue || data[i].get('_ValidTo'))).valueOf() -   //If we have had the final value, then use it
                    new Date(data[0].get('_ValidFrom')).valueOf();

                series.push ( [
                    timeStamp,
                    data[i].get('LeafStoryPlanEstimateTotal') - data[i].get('AcceptedLeafStoryPlanEstimateTotal')
                ]);
        }
        return series;
    },

    _trimNonZero: function(data) {
        return _.filter(data, function(item) { return item.get('LeafStoryPlanEstimateTotal') > 0;});
    },

    _getProgressField: function() {
        return {};
    },

    _doSizeMetrics: function(records){
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
        this._drawMetricsChart('sizeMetricsChart', 
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
        this._drawMetricsChart('dateMetricsChart', 
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
        this._drawMetricsChart('rateMetricsChart',
            'Story Points Delivery',
            'Points per Week', 
            rateMetrics
        );
    },

    _drawMetricsChart: function(id, title, yAxis, data) {
        var me = this;
        if (!data.length) { return; }

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
//                        debugger;
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

    _drawMcChart: function(seriesData, me) {
        var opacity = 1/Math.log1p(seriesData.length);
        this.down('#mcBox').add( {
            xtype: 'rallychart',
            width: '100%',
            height: 600,
            loadMask: false,
            itemId: 'mcChart',
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
                },
                legend: {
                    enabled: false
                },
                title: { 
                    text: ' Probabalistic Forecast for ' + ( me.getSetting('plotItemSize') || 'All sizes'),
                },
                xAxis: {
                    title: { text: 'Date' },
                    type: 'datetime'
                },
                yAxis: [ {
                    title: { 
                        text: 'Story Point Burndown',
                        style : {
                            color: 'rgba(0,180,0,0.8)',
                        }
                    },
                }, {
                    title: { 
                        text: 'Completion Rate',
                        style : {
                            color: '#0f0fff'
                        }
                    },
                    opposite: true,
                }],
                plotOptions: {
                    line: {
                        color: 'rgba(0,180,0,0.2)',
                        marker: {
                            enabled: false
                        },
                        states: {
                            hover: {
                                lineWidthPlus: 5
                            }
                        }
                    }
                }
            },

            chartData: {
                series: seriesData,
            }
        });
    },

});
