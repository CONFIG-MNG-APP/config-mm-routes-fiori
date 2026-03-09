sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"zgsp26/conf/mng/mmroutes/confmngfemmroutes/test/integration/pages/MMRouteConfMain"
], function (JourneyRunner, MMRouteConfMain) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('zgsp26/conf/mng/mmroutes/confmngfemmroutes') + '/test/flp.html#app-preview',
        pages: {
			onTheMMRouteConfMain: MMRouteConfMain
        },
        async: true
    });

    return runner;
});

