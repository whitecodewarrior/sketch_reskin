//RBDMSGISHTML_OL.js

//required JS libraries:
//OpenLayers  (2.13.1)
//jQuery (1.9.1)
//Handlebars (1.1.2.0)
//tv4
//

//http://dev.openlayers.org/releases/OpenLayers-2.13.1/doc/apidocs/files/OpenLayers/Filter/Comparison-js.html

//http://dev.openlayers.org/releases/OpenLayers-2.13.1/doc/apidocs/files/OpenLayers/Symbolizer/Point-js.html


Number.prototype.between = function (a, b, inclusive) {
    var min = Math.min.apply(Math, [a, b]),
        max = Math.max.apply(Math, [a, b]);
    return inclusive ? this >= min && this <= max : this > min && this < max;
};


var RBDMSGIS = {
    ME: null,
    version: "v0.1.1",

    //OGCServer: "http://csgeo.coordinatesolutions.com:8080/geoserver/gwc/service/wms",
    OGCServerUrl: "http://csgeo.coordinatesolutions.com:8080/geoserver/wms",
    OGCServer: "csgeo.coordinatesolutions.com:8080",
    //OGCServerUrl: "http://Windspeedengineering.com:8080/geoserver/wms",
    //OGCServer: "Windspeedengineering.com:8080",


    currentThemeItems: [],
    templates: {},
    olMap: null,
    mapConfig: null,
    themeLayer: null,
    selectLayer: null,
    selectionFeatureLayer: null,
    selectPolyLayer: null,
    polyPointCount: 0,
    protocol: null,
    exactMatchFilterComparisons: ["==", "!=", "<", ">", "<=", ">=", "~", "NULL"],
    rangeFilterComparisons: ["...", ".."],
    singleUseTools: [],
    openPopup: null,
    cursorTooltip: null,

    useThemeLayer: true,

    WFSCustomPopups: [],

    GetWFSPopupText: function (event) {
        return event.text;
    },

    layerSwitcher: null,
    activeSelectLayer: null,
    tooltipControl: null,
    optionHTML: null,
    infoClick: null,
    infoHover: null,
    WFSselect: null,
    WFShover: null,
    WFScontrol: null,

    geographic: new OpenLayers.Projection("EPSG:4326"),
    mercator: new OpenLayers.Projection("EPSG:900913"),

    urlPrefix: "",

    //sets up the map, returns map, themeLayer
    setupMap: function (mapDiv, legendDiv) {
        try {
            ME = this;

            var options = {
                projection: ME.mercator,
                displayProjection: ME.geographic,
                units: "m",
                maxResolution: 156543.0339,
                maxExtent: new OpenLayers.Bounds(-20037508.34, -20037508.34,
									 20037508.34, 20037508.34)
            };

            ME.olMap = new OpenLayers.Map(mapDiv, options);

            var gmap = new OpenLayers.Layer.Google(
                "Google Streets", // the default
                { numZoomLevels: 20 }
            );

            var gphy = new OpenLayers.Layer.Google(
                "Google Physical",
                { type: google.maps.MapTypeId.TERRAIN }
            );
            var ghyb = new OpenLayers.Layer.Google(
                "Google Hybrid",
                { type: google.maps.MapTypeId.HYBRID, numZoomLevels: 20 }
            );
            var gsat = new OpenLayers.Layer.Google(
                "Google Satellite",
                { type: google.maps.MapTypeId.SATELLITE, numZoomLevels: 22 }
            );

            var l = new OpenLayers.Layer.OSM("Open Street Map");

            ME.olMap.addLayers([gphy, gmap, ghyb, gsat, l]);

            //ME.olMap.baseLayer = gmap;


            //THEME LAYER
            if (ME.useThemeLayer){
                ME.themeLayer = new OpenLayers.Layer.Vector("Theme");
                //ME.themeLayer.displayInLayerSwitcher = false;

                //themeLayer: hover / mouse over
                var themeHoverControl = new OpenLayers.Control.SelectFeature(ME.themeLayer, {
                    hover: true,
                    id: "themeHoverControl"
                });
                themeHoverControl.events.register('featurehighlighted', null, ME.onThemeFeatureHighlighted)
                ME.olMap.addControl(themeHoverControl);
                ME.singleUseTools.push("themeHoverControl");

                //themeLayer: select box
                var themeSelectControl = new OpenLayers.Control.SelectFeature(ME.themeLayer, {
                    multiple: false,
                    id: "themeSelectControl",
                    box: true//,
                    //toggleKey: "ctrlKey", // ctrl key removes from selection
                    //multipleKey: "shiftKey" // shift key adds to selection
                });
                themeSelectControl.events.register('boxselectionend', null, ME.onThemeFeatureSelected)
                ME.olMap.addControl(themeSelectControl);
                ME.singleUseTools.push("themeSelectControl");
                ME.olMap.addLayer(ME.themeLayer);
            }
            //THEME LAYER END
            
            //LAYERSWITCHER / TOC / LEGEND
            if (legendDiv) {
                ME.layerSwitcher = new OpenLayers.Control.LayerSwitcher(
                                { div: $("#" + legendDiv).get(0) }
                );
            } else {
                ME.layerSwitcher = new OpenLayers.Control.LayerSwitcher();
            }

            ME.layerSwitcher.ascending = false;
            ME.layerSwitcher.useLegendGraphics = true;
            ME.layerSwitcher.queryableButtonClick = ME.layerSwitcherActiveLayer;
            ME.layerSwitcher.activate();
            ME.olMap.addControl(ME.layerSwitcher);
            
            ME.customMapConfig();

            return { map: ME.olMap, themeLayer: ME.themeLayer };
        } catch (err) {
            return { error: "setupMap: " + err };
        }
    },

    setTooltip: function (enable) {
        if (arby.tooltipControl != null) {
            if (enable)
                ME.tooltipControl.activate();
            else {
                ME.tooltipControl.deactivate();
                // remove popups
                while (ME.olMap.popups.length) {
                    ME.olMap.removePopup(ME.olMap.popups[0]);
                }
            }
        }
    },

    initMapConfig: function(data) {
        ME.mapConfig = data;

        if (data.Map.ShowSelectionShape == true) {
            ME.selectionFeatureLayer = new OpenLayers.Layer.Vector("SelectionFeature", {
                displayInLayerSwitcher: false,
                styleMap: new OpenLayers.StyleMap({
                    fillOpacity: 0,
                    strokeColor: "#A0A0A0"
                })
            });
            ME.olMap.addLayer(ME.selectionFeatureLayer);
        }

        // adding layers based on the map config file
        var mapServices = data.Map.MapServices;
        var tocGroups = data.TOC.Groups;

        ME.optionHTML = "";
        for (var i = tocGroups.length - 1; i >= 0; i--) {
            var group = tocGroups[i];
            for (var j = group.Items.length - 1; j >= 0; j--) {
                var item = group.Items[j];
                var layerName = null;
                var mapService;
                var tooltip = null;
                for (var k = item.Layers.length - 1; k >= 0; k--) {
                    var layer = item.Layers[k];
                    if (mapServices.length > layer.MapIndex) {
                        mapService = mapServices[layer.MapIndex];
                        layerName = mapService.Workspace + ':' + layer.ID;
                        // add tooltip
                        if (layer.ToolTip) {
                            tooltip = layer.ToolTip;
                        }
                    }

                    if (layerName == null)
                        continue;

                    var olLayer = new OpenLayers.Layer.WMS(
                        layer.Name,
                        mapService.Server + ':' + mapService.Port + mapService.MapService,
                        { layers: layerName, transparent: true, tiled: true }
                    );
                    olLayer.isBaseLayer = false;
                    olLayer.setVisibility(item.Visible);
                    olLayer.queryable = item.Active;
                    var isSelected = item.Active ? "selected" : "";
                    ME.optionHTML += "<option value='" + layer.Name + "' " + isSelected + ">" + layer.Name + "</option>";
                    olLayer.description = layer.Name;
                    if (layer.TextPattern != null)
                        olLayer.textpattern = layer.TextPattern;

                    // temp hack to replace legend url-s (geowebcache bug)
                    olLayer.getFullRequestString = function (newParams, altUrl) {
                        var req = OpenLayers.Layer.WMS.prototype.getFullRequestString.call(this, newParams, altUrl);
                        if (newParams.hasOwnProperty('REQUEST') && newParams.REQUEST == 'GetLegendGraphic')
                            return req.replace("/gwc/service", "");
                        return req;
                    }

                    ME.olMap.addLayer(olLayer);

                    if (tooltip && ME.tooltipControl == null) {
                        // add getfeature control
                        var protocol = OpenLayers.Protocol.WFS.fromWMSLayer(olLayer);
                        protocol.options.url = protocol.options.url.replace("/gwc/service", "");
                        ME.tooltipControl = new OpenLayers.Control.GetFeature({
                            protocol: protocol,
                            box: false,
                            hover: true,
                            clickTolerance: 7,
                            multipleKey: "shiftKey",
                            toggleKey: "ctrlKey",
                            maxFeatures: 1
                        });
                        var enableTooltip = true;
                        // replace request by not displaying wait cursor
                        ME.tooltipControl.request = function (bounds, options) {
                            options = options || {};
                            var filter = new OpenLayers.Filter.Spatial({
                                type: ME.tooltipControl.filterType,
                                value: bounds
                            });
                            if (!enableTooltip)
                                return;
                            // remove popups
                            while (ME.olMap.popups.length) {
                                ME.olMap.removePopup(ME.olMap.popups[0]);
                            }
                            var response = this.protocol.read({
                                maxFeatures: 1,
                                filter: filter,
                                callback: function (result) {
                                    if (result.success()) {
                                        if (result.features.length) {
                                            var feature = result.features[0];
                                            var tooltip2 = tooltip;
                                            // replace template fields with actual values
                                            $.each(feature.data, function (key, val) {
                                                tooltip2 = tooltip2.replace("!-" + key.toString().toUpperCase() + "-!", val.toString());
                                            });
                                            var popup = new OpenLayers.Popup(
                                                "idWindow", OpenLayers.LonLat.fromString(feature.geometry.toShortString()), null, tooltip2, null, false);
                                            popup.border = "2px #2e5ea5 solid";
                                            //popup.contentDiv.style.padding = "0px";
                                            feature.popup = popup;
                                            ME.olMap.addPopup(popup);
                                            popup.updateSize();
                                            $("#idWindow").mousemove(function (event) {
                                                // disable hover inside tooltip
                                                event.stopPropagation();
                                                enableTooltip = false;
                                            });
                                            $("#idWindow").mouseout(function (event) {
                                                enableTooltip = true;
                                            });
                                        }
                                    }
                                }
                            });
                        }

                        ME.olMap.addControl(ME.tooltipControl);
                        ME.tooltipControl.activate();
                    }
                }
            }
        }
    },

    initScaleDisplay: function(scaleDiv){
        if (ME.mapConfig.Map.ShowScale == true) {
            scaleDiv.show();
            ME.olMap.events.register("zoomend", ME.olMap, function () {
                scaleDiv.text("1:" + Math.round(ME.olMap.getScale()));
            });
        }
    },

    initPositionDisplay: function (positionDiv) {
        if (ME.mapConfig.Map.ShowCursorPosition == true) {
            positionDiv.show();
            ME.olMap.events.register("mousemove", ME.olMap, function (e) {
                var point = ME.olMap.getLonLatFromPixel(this.events.getMousePosition(e)).transform(arby.mercator, arby.geographic);
                positionDiv.text("(" + point.lon.toFixed(2) + "," + point.lat.toFixed(2)  + ")");
            });
        }
    },

    initCursorTooltipDisplay: function (cursorDiv) {
        if (ME.mapConfig.Map.ShowCursorTip == true) {
            ME.olMap.events.register("mousemove", ME.olMap, function (e) {
                if (ME.cursorTooltip) {
                    cursorDiv.text(ME.cursorTooltip);
                    var y = e.pageY + 20;
                    var x = e.pageX + 20;
                    cursorDiv.css({ 'left': x, 'top': y });
                    cursorDiv.show();
                }
                else
                    cursorDiv.hide();
            });
            ME.olMap.events.register("mouseout", ME.olMap, function (e) {
                cursorDiv.hide();
            });
        }
    },

    zoomToInitialExtent: function () {
        var c = ME.mapConfig.Map.InitialCenter.split(" ");
        var z = ME.mapConfig.Map.InitialZoom;
        var initialCenter = new OpenLayers.LonLat(c[0], c[1]).transform(arby.geographic, arby.mercator);
        arby.olMap.setCenter(initialCenter, z);
    },

    customMapConfig: function () {
        ME.layerSwitcher.removeButtonVisibility = "hidden";
        ME.layerSwitcher.vectorLegend = ME.vectorLegend;
        //20140324 - DL - The queryable property comes from WMS but is not getting set for some reason.
        // - investigate if an issue with CO WMS, ignore since we're in test env.

        // - but, it is used by custom LayerSwitcher to show the (i) button.
        // - I have set it on the two layers we want to click and show info.

        //var coOGWellTiles = new OpenLayers.Layer.WMS(
		//		"Oil and Gas Wells",
		//		ME.OGCServerUrl,
		//		{ layers: "COENV:wells", transparent: true, tiled: false }
		//   );
        //coOGWellTiles.isBaseLayer = false;
        //coOGWellTiles.setVisibility(false);
        //if (!coOGWellTiles.queryable) {
        //    coOGWellTiles.queryable = true;
        //}
        //if (!coOGWellTiles.description){
        //    coOGWellTiles.description = "Oil and Gas Wells"
        //}

        //var coSampleTiles = new OpenLayers.Layer.WMS(
		//		"Sample Locations",
		//		ME.OGCServerUrl,
		//		{ layers: "COENV:locations", transparent: true, tiled: false }
		//   );
        //coSampleTiles.isBaseLayer = false;
        //coSampleTiles.setVisibility(true);
        //if (!coSampleTiles.queryable) {
        //    coSampleTiles.queryable = true;
        //}
        //if (!coSampleTiles.description) {
        //    coSampleTiles.description = "Sample Locations"
        //}

        ME.selectLayer = new OpenLayers.Layer.Vector("Selection", { displayInLayerSwitcher: false }, {
            styleMap: new OpenLayers.Style(OpenLayers.Feature.Vector.style["select"])
        });
        ME.olMap.addLayer(ME.selectLayer);

        ME.selectPolyLayer = new OpenLayers.Layer.Vector("SelectionPoly", { displayInLayerSwitcher: false });
        ME.olMap.addLayer(ME.selectPolyLayer);

        //ME.olMap.addLayer(coOGWellTiles);
        //ME.olMap.addLayer(coSampleTiles);
        


        //themeLayer: select box
        //var themeSelectControl = new OpenLayers.Control.SelectFeature(ME.themeLayer, {
        //    multiple: false,
        //    id: "themeSelectControl",
        //    box: true//,
        //});
        //themeSelectControl.events.register('boxselectionend', null, ME.onThemeFeatureSelected)
        //ME.olMap.addControl(themeSelectControl);
        //ME.singleUseTools.push("themeSelectControl");

        //make a selection tool
        var control = new OpenLayers.Control.GetFeature({
            id: "wmsGetFeatureControl",
            //protocol: OpenLayers.Protocol.WFS.fromWMSLayer(layer),
            box: true,
            hover: false,
            multipleKey: "shiftKey",
            toggleKey: "ctrlKey",
            request: function (bounds, options) {
                var pfilter = new OpenLayers.Filter.Spatial({
                    type: OpenLayers.Filter.Spatial.INTERSECTS,
                    value: bounds
                });
                ME.selectLayer.removeAllFeatures();
                if (ME.selectionFeatureLayer) {
                    ME.selectionFeatureLayer.removeAllFeatures();
                    ME.selectionFeatureLayer.addFeatures(new OpenLayers.Feature.Vector(bounds.toGeometry()));
                }
                var retVal = {
                    name: ME.activeSelectLayer,
                    features: null,
                    operation: 'selectionstart'
                };
                ME.callbackSelection(retVal);
                $.each(ME.protocol, function (i, protocol) {
                    protocol.read({
                        filter: pfilter,
                        callback: function (resp) {
                            if (resp.features) {
                                if (protocol.textpattern !== undefined) {
                                    $.each(resp.features, function (i, feature) {
                                        var displaytext = protocol.textpattern;
                                        // replace template fields with actual values
                                        $.each(feature.data, function (key, val) {
                                            displaytext = displaytext.replace("!-" + key.toString().toUpperCase() + "-!", val.toString());
                                        });
                                        feature.displaytext = (displaytext != "" ? displaytext : "unnamed");
                                    });
                                }
                                ME.selectLayer.addFeatures(resp.features);
                            }
                            var retVal = {
                                name: ME.activeSelectLayer,
                                features: resp.features,
                                operation: 'selected',
                                index: i
                            };
                            ME.callbackSelection(retVal);
                        },
                        scope: new OpenLayers.Strategy.BBOX()
                    });
                });
            }
        });
        control.events.register("featuresselected", this, ME.onFeaturesSelected);
        control.events.register("featureunselected", this, function (e) {
            ME.selectLayer.removeFeatures([e.feature]);
        });
        control.events.register("deactivate", this, function () {
            //ME.selectLayer.removeAllFeatures();
        });

        ME.olMap.addControl(control);
        ME.singleUseTools.push("wmsGetFeatureControl");

        // make point selection tool
        var pointSelCtrl = new OpenLayers.Control.GetFeature({
            id: "pointSelectControl",
            //protocol: OpenLayers.Protocol.WFS.fromWMSLayer(layer),
            click: true,
            hover: false,
            clickTolerance: 7,
            multipleKey: "shiftKey",
            toggleKey: "ctrlKey",
            request: function (bounds, options) {
                var pfilter = new OpenLayers.Filter.Spatial({
                    type: OpenLayers.Filter.Spatial.INTERSECTS,
                    value: bounds
                });
                ME.selectLayer.removeAllFeatures();
                var retVal = {
                    name: ME.activeSelectLayer,
                    features: null,
                    operation: 'selectionstart'
                };
                ME.callbackSelection(retVal);
                $.each(ME.protocol, function (i, protocol) {
                    protocol.read({
                        filter: pfilter,
                        callback: function (resp) {
                            if (resp.features) {
                                if (protocol.textpattern !== undefined) {
                                    $.each(resp.features, function (i, feature) {
                                        var displaytext = protocol.textpattern;
                                        // replace template fields with actual values
                                        $.each(feature.data, function (key, val) {
                                            displaytext = displaytext.replace("!-" + key.toString().toUpperCase() + "-!", val.toString());
                                        });
                                        feature.displaytext = (displaytext != "" ? displaytext : "unnamed");
                                    });
                                }
                                ME.selectLayer.addFeatures(resp.features);
                            }
                            var retVal = {
                                name: ME.activeSelectLayer,
                                features: resp.features,
                                operation: 'selected',
                                index: i
                            };
                            ME.callbackSelection(retVal);
                        },
                        scope: new OpenLayers.Strategy.BBOX()
                    });
                });
            }
        });
        pointSelCtrl.events.register("featuresselected", this, ME.onFeaturesSelected);
        pointSelCtrl.events.register("featureunselected", this, function (e) {
            ME.selectLayer.removeFeatures([e.feature]);
        });
        pointSelCtrl.events.register("deactivate", this, function () {
            //ME.selectLayer.removeAllFeatures();
        });

        ME.olMap.addControl(pointSelCtrl);
        ME.singleUseTools.push("pointSelectControl");

        //make poligon selection tool
        var polySelCtrl = new OpenLayers.Control.DrawFeature(ME.selectPolyLayer, OpenLayers.Handler.Polygon, {
            id: "polySelectControl",
            geodesic: true,
            handlerOptions: {
                citeCompliant: true
            },
            callbacks: {
                point: function () {
                    ME.cursorTooltip = "Double Click to Finish";
                    ++polyPointCount;
                }
            }
        });
        polySelCtrl.events.register("featureadded", this, function (e) {
            ME.cursorTooltip = "Click to Select Points";
            var pfilter = new OpenLayers.Filter.Spatial({
                type: OpenLayers.Filter.Spatial.INTERSECTS,
                value: e.feature.geometry
            });
            ME.selectLayer.removeAllFeatures();
            if (polyPointCount < 3) {
                alert('Select More Than Two Points!');
                polyPointCount = 0;
                return;
            }
            polyPointCount = 0;
            var retVal = {
                name: ME.activeSelectLayer,
                features: null,
                operation: 'selectionstart'
            };
            ME.callbackSelection(retVal);
            $.each(ME.protocol, function (i, protocol) {
                protocol.read({
                    filter: pfilter,
                    callback: function (resp) {
                        if (resp.features) {
                            if (protocol.textpattern !== undefined) {
                                $.each(resp.features, function (i, feature) {
                                    var displaytext = protocol.textpattern;
                                    // replace template fields with actual values
                                    $.each(feature.data, function (key, val) {
                                        displaytext = displaytext.replace("!-" + key.toString().toUpperCase() + "-!", val.toString());
                                    });
                                    feature.displaytext = (displaytext != "" ? displaytext : "unnamed");;
                                });
                            }
                            ME.selectLayer.addFeatures(resp.features);
                        }
                        var retVal = {
                            name: ME.activeSelectLayer,
                            features: resp.features,
                            operation: 'selected',
                            index: i
                        };
                        ME.callbackSelection(retVal);
                    },
                    scope: new OpenLayers.Strategy.BBOX()
                });
            });

            if (ME.selectionFeatureLayer) {
                ME.selectionFeatureLayer.removeAllFeatures();
                ME.selectionFeatureLayer.addFeatures(ME.selectPolyLayer.features);
            }
            ME.selectPolyLayer.removeAllFeatures();
        });
        ME.olMap.addControl(polySelCtrl);
        ME.singleUseTools.push("polySelectControl");

        //make a click info tool
        var infoClick = new OpenLayers.Control.WMSGetFeatureInfo({
            id: 'infoClickControl',
            output: "features",
            url: 'http://' + ME.OGCServer + '/geoserver/wms',
            title: 'Identify features by clicking',
            displayClass: 'olControlWMSGetFeatureInfo',
            layerUrls: ['http://' + ME.OGCServer + '/geoserver/gwc/service/wms/'],
            hover: false,
            queryVisible: true,
            infoFormat: "text/html"
        });

        infoClick.events.register("getfeatureinfo", this, function (e) {
            var txt = ME.GetWFSPopupText(e);
            if (txt != null) {
                var popup = new OpenLayers.Popup.FramedCloud(
                    "chicken",
                    ME.olMap.getLonLatFromPixel(e.xy),
                    null,
                    txt,
                    null,
                    true
                );
                ME.openPopup = popup;

                ME.olMap.addPopup(popup, true);
            }
        });

        ME.olMap.addControl(infoClick);
        ME.singleUseTools.push("infoClickControl");

        //infoClick.layers = new Array();
        //infoClick.layers[0] = coSampleTiles;
        //ME.activateControl("infoClickControl");
    },

    

    centerLatLong: function (lat, lon, zoomlevel) {
        if (zoomlevel == 'current') {
            zoomlevel = ME.olMap.getZoom();
        }
        
        ME.olMap.setCenter(
                new OpenLayers.LonLat(lon, lat).transform(
                    new OpenLayers.Projection("EPSG:4326"),
                    ME.olMap.getProjectionObject()
                    ), zoomlevel
            );
    },

    //CONTROLS START
    setDefaultTool: function () {
        ME.singleUseTools.forEach(function (a) {
            ME.deactivateControl(a);
        });
        ME.cursorTooltip = null;
    },

    setActiveLayers: function (layerName) {
        ME.activeSelectLayer = layerName;
        
        ME.protocol = [];
        if (layerName != null) {
            layerName.forEach(function (lName) {
                var layer = ME.olMap.getLayersByName(lName)[0];
                //layer.setVisibility(true);
                var protocol = OpenLayers.Protocol.WFS.fromWMSLayer(layer);
                protocol.options.url = protocol.options.url.replace("/gwc/service", "");
                if (layer.textpattern !== undefined)
                    protocol.textpattern = layer.textpattern;
                ME.protocol.push(protocol);
            });
        }
        else
            ME.setDefaultTool();
    },

    activateSelectControl: function (layerName, controlName) {
        if (layerName == null) {
            alert("No selection layer(s) specified");
            return;
        }

        if (controlName == "wmsGetFeatureControl")
            ME.cursorTooltip = "Click to Select Rectangle";
        else if (controlName == "polySelectControl") {
            ME.cursorTooltip = "Click to Select Points";
            polyPointCount = 0;
        }
        else
            ME.cursorTooltip = null;

        ME.setActiveLayers(layerName);
        ME.activateControl(controlName);
    },

    deactivateSelectControl: function (controlName) {
        ME.deactivateControl(controlName);
    },

    activateControl: function (controlName){
        try {
            var self = this;
            //deactivate other single use tools if this is a single use tool
            if ($.inArray(controlName, this.singleUseTools) != -1) {
                this.singleUseTools.forEach( function(a) {
                    self.deactivateControl(a);
                });
            }

            this.olMap.getControlsBy("id", controlName)[0].activate();
        }
        catch (err) {
            return { error: "activateControl: " + err };
        }
    },

    deactivateControl: function(controlName){
        try {
            this.olMap.getControlsBy("id", controlName)[0].deactivate();
            if (ME.openPopup != null) {
                ME.olMap.removePopup(ME.openPopup);
            }
        }
        catch (err) {
            return { error: "deactivateThemeMouseOver: " + err };
        }
    },
    //CONTROLS END

    //THEMED POINTS SCHEMA START
    JSONSchema: function () {
        try{
            return {
                "title": "ThemedFeatures",
                "description": "A set of Features (each with an X, Y, and ThemeValue) to be symbolized according to ThemeItems (each with properties for establishing a filter and symbolization).",
                "type": "object",
                "$schema": "http://json-schema.org/draft-03/schema",
                "required": ["Features", "ThemeItems"],
                "properties": {
                    "Features": {
                        "type": "array",
                        "required": false,
                        "minItems": 0,
                        "items":
                            {
                                "type": "object",
                                "required": ["ThemeValue", "X", "Y"],
                                "properties": {
                                    "ID": {
                                        "type": "number"
                                    },
                                    "ThemeValue": {
                                        "type": "number"
                                    },
                                    "X": {
                                        "type": "number"
                                    },
                                    "Y": {
                                        "type": "number"
                                    },
                                    "PopupHTML": {
                                        "type": "string"
                                    },
                                    "Attributes": {}
                                }
                            }
                    },
                    "ThemeItems": {
                        "type": "array",
                        "required": false,
                        "minItems": 1,
                        "items":
                            {
                                "type": "object",
                                "required": false,
                                "properties": {
                                    "StrokeColor": {
                                        "type": "string"
                                    },
                                    "StrokeOpacity": {
                                        "type": "number"
                                    },
                                    "StrokeWidth": {
                                        "type": "number"
                                    },
                                    "FillColor": {
                                        "type": "string"
                                    },
                                    "FillOpacity":{
                                        "type": "number"
                                    },
                                    "PointRadius": {
                                        "type": "number"
                                    },
                                    "ExternalGraphic":{
                                        "type": "string"
                                    },
                                    "GraphicWidth": {
                                        "type": "number"
                                    },
                                    "GraphicHeight": {
                                        "type": "number"
                                    },
                                    "GraphicOpacity": {
                                        "type": "number"
                                    },
                                    "GraphicXOffset": {
                                        "type": "number"
                                    },
                                    "GraphicYOffset": {
                                        "type": "number"
                                    },
                                    "GraphicRotation": {
                                        "type": "number"
                                    },
                                    "GraphicName": {
                                        "type": "string"
                                    },

                                    "FilterComparison":{
                                        "type": "string"
                                        //OpenLayers.Filter.Comparison.EQUAL_TO = “==”;
                                        //OpenLayers.Filter.Comparison.NOT_EQUAL_TO = “!=”;
                                        //OpenLayers.Filter.Comparison.LESS_THAN = “<”;
                                        //OpenLayers.Filter.Comparison.GREATER_THAN = “>”;
                                        //OpenLayers.Filter.Comparison.LESS_THAN_OR_EQUAL_TO = “<=”;
                                        //OpenLayers.Filter.Comparison.GREATER_THAN_OR_EQUAL_TO = “>=”;
                                        //OpenLayers.Filter.Comparison.LIKE = “~”;
                                        //OpenLayers.Filter.Comparison.BETWEEN = “..”;

                                        //NOT SUPPORTED:
                                        //OpenLayers.Filter.Comparison.IS_NULL = “NULL”;
                                        //ADDED BETWEEN INCLUSIVE "..." - not supported by OpenLayers Rules
                                    },
                                    "FilterValue":{
                                        "type": "string"
                                    },
                                    "FilterLowerBound": {
                                        "type": "string"
                                    },
                                    "FilterUpperBound": {
                                        "type": "string"
                                    },
                                    "Name": {
                                        "type": "string"
                                    }
                                }
                            }
                    }
                }
            };
        } catch (err) {
            return { error: "JSONSchema: " + err };
        }
    },

    validateJSON: function (data, validateFeatures) {
        try {
            //set default value
            if(validateFeatures==null){
                validateFeatures = false;
            }

            var vData = JSON.parse(JSON.stringify(data));

            if (!validateFeatures) {
                vData.Features.length = 0;
            }

            var r = tv4.validateMultiple(vData, this.JSONSchema(), true);

            if (r.valid == true) {
                return { success: true, result: null};
            } else {
                return { success: false, result: r };
            }

        } catch (err) {
            return {error: "validateJSON: " + err}
        }
    },
    //THEMED POINTS SCHEMA END

    //THEMED POINTS - START

    //data: see sampleJSONSchema
    //zoomToExtent: boolean - default is true.
    //callback: function (success, result)
    //- success: boolean (true if all went fine, otherwise false)
    drawThemedPoints: function (data, callback, zoomToExtent) {
        try {
            if (!ME.useThemeLayer) {
                return null;
            }
            
            if (ME.openPopup != null) {
                ME.olMap.removePopup(ME.openPopup);
            }

            if (zoomToExtent == null) {
                //default to true
                zoomToExtent = true;
            }

            if (this.themeLayer == null) {
                callback(false, "themeLayer must be set to an OpenLayers.Layer.Vector.")
                return null;
            }

            var s = data;

            var v = this.validateJSON(s, false);

            if (!v.success) {
                callback(false, v.result);
                return null;
            }

            var themes = s.ThemeItems;
            this.currentThemeItems = themes;

            this.themeLayer.removeAllFeatures();

            var st = new OpenLayers.Style();

            var themes = s.ThemeItems;
            for (j = 0; j < themes.length; ++j) {
                //might want to check the validity, but assuming valid now.

                //setup point symbolizer
                var sym = new OpenLayers.Symbolizer.Point({});
                if (themes[j] != null) {
                    if (themes[j].StrokeColor != null) {
                        sym.strokeColor = themes[j].StrokeColor;
                    }
                    if (themes[j].StrokeOpacity != null) {
                        sym.strokeOpacity = themes[j].StrokeOpacity;
                    }
                    if (themes[j].StrokeWidth != null) {
                        sym.strokeWidth = themes[j].StrokeWidth;
                    }

                    if (themes[j].FillColor != null) {
                        sym.fillColor = themes[j].FillColor;
                    }
                    if (themes[j].FillOpacity != null) {
                        sym.fillOpacity = themes[j].FillOpacity;
                    }

                    if (themes[j].PointRadius != null) {
                        sym.pointRadius = themes[j].PointRadius;
                    }

                    if (themes[j].ExternalGraphic != null) {
                        sym.externalGraphic = themes[j].ExternalGraphic;
                    }
                    if (themes[j].GraphicWidth != null) {
                        sym.graphicWidth = themes[j].GraphicWidth;
                    }
                    if (themes[j].GraphicHeight != null) {
                        sym.graphicHeight = themes[j].GraphicHeight;
                    }
                    if (themes[j].GraphicOpacity != null) {
                        sym.graphicOpacity = themes[j].GraphicOpacity;
                    }
                    if (themes[j].GraphicXOffset != null) {
                        sym.graphicXOffset = themes[j].GraphicXOffset;
                    }
                    if (themes[j].GraphicYOffset != null) {
                        sym.graphicYOffset = themes[j].GraphicYOffset;
                    }
                    if (themes[j].GraphicRotation != null) {
                        sym.rotation = themes[j].GraphicRotation;
                    }
                    if (themes[j].GraphicName != null) {
                        sym.graphicName = themes[j].GraphicName;
                    }
                }

                r = this.getRuleFromTheme(themes[j]);
                if (!r) {
                    continue;
                }
                r.symbolizer = sym;

                st.addRules([r]);
            }

            var sm = new OpenLayers.StyleMap({
                "default": st
                //,"select": OpenLayers.Feature.Vector.style.select
            });

            this.themeLayer.styleMap = sm;

            //add features to ThemeLayer
            var fs = [];
            for (i = 0; i < s.Features.length; ++i) {
                var att = $.extend({}, s.Features[i].Attributes);
                att = $.extend(att, {
                    ID: s.Features[i].ID,
                    X: s.Features[i].X,
                    Y: s.Features[i].Y,
                    ThemeValue: s.Features[i].ThemeValue,
                    PopupHTML: s.Features[i].PopupHTML,
                });

                var thisVector = new OpenLayers.Feature.Vector(
                                       new OpenLayers.Geometry.Point(
                                            s.Features[i].X, 
                                            s.Features[i].Y
                                        ).transform(
                                            new OpenLayers.Projection("EPSG:4326"), this.olMap.getProjectionObject()
                                        ),
                                        att
                                );
                fs.push(thisVector);
            }
            this.themeLayer.addFeatures(fs);

            this.themeLayer.setVisibility(false);

            this.themeLayer.setVisibility(true);

            //zoom to themeLayer
            if (zoomToExtent) {
                this.olMap.zoomToExtent(this.themeLayer.getDataExtent());
            }

            callback(true, null);
            return null;
        }
        catch (err) {
            callback(false, err);
        }
    },

    clearThemedPoints: function (callback) {
        try {
            if (!ME.useThemeLayer) {
                return null;
            }

            ME.currentThemeItems = [];
            ME.themeLayer.removeAllFeatures();
            ME.themeLayer.setVisibility(false);
            callback(true, null);
            return null;
        }
        catch (err) {
            callback(false, err);
        }
    },

    getRuleFromTheme: function (theme) {
        var r;
        if ($.inArray(theme.FilterComparison, this.exactMatchFilterComparisons) != -1) {
            if (theme.FilterValue == null || !typeof(theme.FilterValue) == 'string') {
                throw "Filter value is required for FilterComparison '" + theme.FilterComparison + "' in theme: " + theme.Name;
                return null;
            }

            //single compare
            r = new OpenLayers.Filter.Comparison({
                property: "ThemeValue",
                value: theme.FilterValue
            });

            switch (theme.FilterComparison) {
                case "==":
                    r.type = OpenLayers.Filter.Comparison.EQUAL_TO;
                    return r;
                    break;
                case "!=":
                    r.type = OpenLayers.Filter.Comparison.NOT_EQUAL_TO;
                    return r;
                    break;
                case "<":
                    r.type = OpenLayers.Filter.Comparison.LESS_THAN;
                    return r;
                    break;
                case ">":
                    r.type = OpenLayers.Filter.Comparison.GREATER_THAN;
                    return r;
                    break;
                case "<=":
                    r.type = OpenLayers.Filter.Comparison.LESS_THAN_OR_EQUAL_TO;
                    return r;
                    break;
                case ">=":
                    r.type = OpenLayers.Filter.Comparison.GREATER_THAN_OR_EQUAL_TO;
                    return r;
                    break;
                case "~":
                    r.type = OpenLayers.Filter.Comparison.LIKE;
                    return r;
                    break;
            }
        } else {
            //bounds
            if (theme.FilterLowerBound == null || theme.FilterUpperBound == null || !typeof (theme.FilterLowerBound) == 'string' || !typeof (theme.FilterUpperBound) == 'string') {
                throw "FilterLowerBound and FilterUpperBound are required for FilterComparison '..' on theme: " + theme.Name;
                return null;
            }
            r = new OpenLayers.Filter.Comparison({
                property: "ThemeValue",
                lowerBoundary: theme.FilterLowerBound,
                upperBoundary: theme.FilterUpperBound,
                type: OpenLayers.Filter.Comparison.BETWEEN
            });
            return r;
        }
        return null;
    },

    getTheme: function (themes, thisThemeValue) {
        var thisTheme;

        for (j = 0; j < themes.length; ++j) {
            thisTheme = null;

            if ($.inArray(themes[j].FilterComparison, this.exactMatchFilterComparisons) != -1) {
                //single compare

                switch (themes[j].FilterComparison) {
                    case "~":
                        if (thisThemeValue.indexOf(themes[j].FilterValue == 0)) {
                            return themes[j];
                        }
                        break;
                    case "NULL":
                        if (thisThemeValue == null){
                            return themes[j];
                        }
                        break;
                    default:
                        if (typeof thisThemeValue == "string") {
                            if (eval("'" + thisThemeValue + "' " + themes[j].FilterComparison + " '" + themes[j].FilterValue + "'") == true) {
                                return themes[j];
                            }

                        } else {
                            if (eval(thisThemeValue + " " + themes[j].FilterComparison + " " + themes[j].FilterValue) == true) {
                                return themes[j];
                            }
                        }
                        break;
                }

            } else {
                //bounds

                if (themes[j].FilterLowerBound == null || themes[j].FilterUpperBound==null) {
                    continue;
                }

                switch (themes[j].FilterComparison){
                    case "...":
                        if (thisThemeValue.between(themes[j].FilterLowerBound, themes[j].FilterUpperBound, true)) {
                            return themes[j];
                        }
                        break;
                    default:
                        if (thisThemeValue.between(themes[j].FilterLowerBound, themes[j].FilterUpperBound, false)) {
                            return themes[j];
                        }
                        break;
                }
            }
        }

        return null;
        //return thisTheme;
    },

    onThemeFeatureHighlighted: function (evt) {
        try{
            // Needed only for interaction, not for the display.
            var onPopupClose = function (evt) {
                // 'this' is the popup.
                var feature = this.feature;
                if (feature.layer) {
                    var c = feature.layer.map.getControlsBy("id", "themeHoverControl")[0];
                    c.unselect(feature);
                }  
                this.destroy();
            }

            feature = evt.feature;


            var popupContent;
            if (feature.attributes.PopupHTML) {
                var puSource = feature.attributes.PopupHTML;
                if (puSource.indexOf("{{") != -1) {
                    //this is a template
                    try{
                        var thisTemplate = Handlebars.compile(puSource);
                        popupContent = thisTemplate(feature.attributes);
                    } catch (e) {
                        popupContent = "bad template: " + e.message;
                    }

                } else {
                    //just use it
                    popupContent = puSource;
                }

            } else {
                popupContent = "<h2>Value: " + feature.attributes.ThemeValue + "</h2>";
            }
            
            popup = new OpenLayers.Popup.FramedCloud("featurePopup",
                feature.geometry.getBounds().getCenterLonLat(),
                new OpenLayers.Size(100, 100),
                popupContent,
                null, true, onPopupClose);
            ME.openPopup = popup;
            feature.popup = popup;
            popup.feature = feature;
            feature.layer.map.addPopup(popup, true);
        } catch (err) {
            return { error: "onThemeFeatureHighlighted: " + err };
        }
    },
    //THEMED POINTS - END

    //THEMED POINTS LEGEND - START
    loadTemplates: function () {
        // http://handlebarsjs.com/

        var self = this;

        var source, template;
        var toLoad = ["layertemplate", "olsymboltemplate", "circlesymboltemplate", "rectanglesymboltemplate", "imagesymboltemplate"];
        toLoad.forEach(function (tName) {
            if (!self.templates[tName]) {
                $.ajax({
                    async: false,
                    url: urlPrefix + "/RBDMSGIS/Templates/" + tName + ".html",
                    success: function (data) {
                        self.templates[tName] = Handlebars.compile(data);
                    },
                    error: function (e) {
                        throw "failed to load template " + tName;
                    }
                });
            }
        });
    },

    drawThemedPointsLegend: function (divId) {
        try {
            var self = this;
            var lDiv 
            if (typeof divId == "string") {
                lDiv = $("#" + divId);
                lDiv.empty();
            } else {
                lDiv = divId;
            }
            
            this.loadTemplates();

            var layerNumber = 0;
            var scaleFactor = 2;
            var maxWidth = 25;

            var divHtml;
            var l = {};

            var i = 0;
            l.layername = "Theme Layer";
            divHtml = this.templates["layertemplate"](l);
            //lDiv.append(divHtml);

            this.currentThemeItems.forEach(function (theme) {
                theme.layernumber = layerNumber;
                theme.symbolnumber = i;

                var diameter = theme.PointRadius * 2;

                divHtml = "";

                var olSym;
                switch (theme.GraphicName) {
                    case "cross":
                        olSym = OpenLayers.Renderer.symbol.cross;
                        break;
                    case "square":
                        olSym = OpenLayers.Renderer.symbol.square;
                        break;
                    case "star":
                        olSym = OpenLayers.Renderer.symbol.star;
                        break;
                    case "triangle":
                        olSym = OpenLayers.Renderer.symbol.triangle;
                        break;
                    case "x":
                        olSym = OpenLayers.Renderer.symbol.x;
                        break;
                }




                if (olSym) {
                    //draw it
                    var pt = [];
                    for (i = 0; i < olSym.length; i = i + 2) {
                        pt.push({ x: olSym[i], y: olSym[i + 1] });
                    }

                    //20140324 - DL - Star draws offset from left. 
                    // - Attempt to translate x coordinates to 0 min.
                    var shiftX = Math.min.apply(null, $.map(pt, function (o) { return o["x"] }));
                    if (shiftX != 0) {
                        for (i = 0; i < pt.length; i += 1) {
                            pt[i].x -= shiftX;
                        }
                    }

                    //find max
                    var maxX = pt[0].x;
                    var maxY = pt[0].y;
                    for (i = 1; i < pt.length; i++) {
                        if (pt[i].x > maxX) { maxX = pt[i].x }
                        if (pt[i].y > maxY) { maxY = pt[i].y }
                    }

                    theme.width = diameter * scaleFactor;
                    theme.height = diameter * scaleFactor;
                    theme.viewbox = "0 0 " + maxX + " " + maxY;

                    if (theme.GraphicRotation) {
                        theme.transform = "rotate(" + theme.GraphicRotation + " " + theme.width / 2 + " " + theme.height / 2 + ")";
                    }

                    //walk points, build path
                    var svg;
                    svg = 'M' + pt[0].x + ' ' + pt[0].y + ' ';
                    for (i = 1; i < pt.length; i++) {
                        svg += 'L' + pt[i].x + ' ' + pt[i].y + ' ';
                    }
                    svg += 'Z';
                    theme.svg = svg;

                    divHtml = self.templates["olsymboltemplate"](theme);
                } else {
                    if (theme.ExternalGraphic) {
                        theme.width = diameter;
                        theme.height = diameter;
                        theme.viewbox = "0 0 " + diameter + " " + diameter;
                        divHtml = self.templates["imagesymboltemplate"](theme);
                    } else {
                        //circle: default
                        theme.width = diameter * scaleFactor;
                        theme.height = diameter * scaleFactor;
                        theme.viewbox = "0 0 " + diameter + " " + diameter;
                        theme.centerx = theme.PointRadius;
                        theme.centery = theme.PointRadius;
                        divHtml = self.templates["circlesymboltemplate"](theme);
                    }
                }
                maxWidth = (theme.width > maxWidth) ? theme.width : maxWidth;

                lDiv.append(divHtml);
                i++;
            });

            lDiv.css("visibility", "visible");

            $(".legendSymbol").css("width", maxWidth + "px");

            return null;
        }
        catch (err) {
            return { error: "drawThemedPointsLegend: " + err };
        }
    },
    //THEMED POINTS LEGEND - END

    //LAYERSWITCHER START
    vectorLegend: function (l) {
        var lDiv = document.createElement("div");
        ME.drawThemedPointsLegend($(lDiv));
        return lDiv.innerHTML;
    },

    layerSwitcherActiveLayer: function (layer) {
        layer.setVisibility(true);
        var control = ME.olMap.getControlsBy("id", "infoClickControl")[0];
        control.layers = new Array();
        control.layers[0] = layer;
        if ($.inArray(layer.name, ME.WFSCustomPopups) != -1) {
            control.infoFormat = "application/json";
        } else {
            control.infoFormat = "text/html";
        }

        ME.activateControl("infoClickControl");
    },
    //LAYERSWITCHER END

    //SAMPLE DATA - START
    samplePoints: function () {
        try {
            var sample = {
                Features: []
                    ,

                ThemeItems: [
                    {
                        Name: 'Theme 0',
                        FilterComparison: '==',
                        FilterValue: '4',
                        PointRadius: 7,
                        FillColor: '#000000',
                        FillOpacity: 0.4,
                        StrokeWidth: 0

                    },
                    {
                        Name: 'Theme 1',
                        FilterComparison: '<=',
                        FilterValue: '5',
                        PointRadius: 7,
                        FillColor: '#00ff00',
                        GraphicName: 'square',
                        StrokeWidth: 1

                    },
                    {
                        Name: 'Theme 2',
                        FilterComparison: '...',
                        FilterLowerBound: '6',
                        FilterUpperBound: '10',
                        PointRadius: 6,
                        FillColor: '#ff0000',
                        GraphicName: 'triangle',
                        StrokeWidth: 1
                    },
                    {
                        Name: 'Theme 3',
                        FilterComparison: '...',
                        FilterLowerBound: '11',
                        FilterUpperBound: '12',
                        PointRadius: 3,
                        FillColor: '#ff00ff',
                        GraphicName: 'cross',
                        StrokeColor: '#000000',
                        StrokeWidth: 1
                    },
                    {
                        Name: 'Theme 3a',
                        FilterComparison: '...',
                        FilterLowerBound: '12',
                        FilterUpperBound: '15',
                        PointRadius: 3,
                        FillColor: '#ff00ff',
                        GraphicName: 'cross',
                        GraphicRotation: 45,
                        StrokeColor: '#000000',
                        StrokeWidth: 1
                    },
                    {
                        Name: 'Theme 4',
                        FilterComparison: '...',
                        FilterLowerBound: '16',
                        FilterUpperBound: '20',
                        PointRadius: 6,
                        FillColor: '#0000ff',
                        GraphicName: 'star',
                        StrokeColor: '#ff0000',
                        StrokeWidth: 1
                    },
                    {
                        Name: 'Theme 5',
                        FilterComparison: '...',
                        FilterLowerBound: '21',
                        FilterUpperBound: '25',
                        PointRadius: 4,
                        FillColor: '#00ffff',
                        GraphicName: 'circle',
                        StrokeColor: '#000000',
                        StrokeWidth: 1

                    },
                    {
                        Name: 'Theme 6',
                        FilterComparison: '==',
                        FilterValue: '26',
                        PointRadius: 30,
                        ExternalGraphic: 'http://virtuales.com/VES2/images/1999smallercllogo.gif'
                    },
                    {
                        Name: 'Theme 7',
                        FilterComparison: '>=',
                        FilterValue: '27',
                        PointRadius: 8,
                        FillColor: '#00ffff',
                        StrokeWidth: 0
                    },
                    {
                        Name: 'Theme 8',
                        FilterComparison: '==',
                        FilterValue: 'ak',
                        PointRadius: 18,
                        FillColor: '#f0fff0',
                        StrokeWidth: 4
                    }


                ]
            };

            var puhtml = "<p>ID:{{ID}}</p><p>X:{{X}}</p><p>Y:{{Y}}</p><p>ThemeValue:{{ThemeValue}}</p>"
            for (i = 1; i < 10; ++i) {
                for (j = -5; j < 30; ++j) {
                    if (j == 23) {
                        sample.Features.push({ ID: i, X: (-105 + (i / 5)), Y: (35 + (j / 5)), ThemeValue: 'ak', PopupHTML: puhtml, Attributes: { Key1: i, Key2: j } });
                    } else {
                        sample.Features.push({ ID: i, X: (-105 + (i / 5)), Y: (35 + (j / 5)), ThemeValue: j, PopupHTML: puhtml, Attributes: { Key1: i, Key2: j } });
                    }
                }
            }

            return sample;
        }
        catch (err) {
            return { error: "samplePoints: " + err };
        }
        
    },
    //SAMPLE DATA _ END
    
    //SELECTION _ START
    selectionCallbacksO: {s:[]},
    selectionCallbacks: [],

    addSelectionCallback: function (callback) {
        try {
            this.selectionCallbacksO.s.push({ f: callback });

            //this.selectionCallbacks.push(callback);
            return null;
        } catch (err) {
            return { error: "addSelectionCallback: " + err };
        }
    },

    removeSelectionCallback: function (callback) {
        try {
            //var idx = this.selectionCallbacks.indexOf(callback);
            //if (idx > -1) {
            //    this.selectionCallbacks.splice(idx, 1);
            //}

            var idxO = -1;
            for (i = 0; i < this.selectionCallbacksO.s.length; i++) {
                if (this.selectionCallbacksO.s[i].f == callback){
                    idxO = i;
                    break;
                }
            }
            if (idxO > -1) {
                this.selectionCallbacksO.s.splice(idxO,1);
            }

            return null;
        } catch (err) {
            return { error: "removeSelectionCallback: " + err };
        }
    },

    callbackSelection: function(data){
        try{
            ME.selectionCallbacksO.s.forEach(function (cbO) {
                //20140324 - DL - Return selection object including name and features.
                cbO.f(data);
                //}
            });
        } catch(err){
            return { error: "onThemeFeatureSelected or onFeaturesSelected: " + err };
        }
    },

    clearSelection: function () {
        if (ME.selectionFeatureLayer) {
            ME.selectLayer.removeAllFeatures();
            ME.selectionFeatureLayer.removeAllFeatures();
        }
        ME.bufferClear();
    },

    onFeaturesSelected: function (evt) {
        if (evt.features)
            ME.selectLayer.addFeatures(evt.features);
        
        var retVal = {
            name: ME.activeSelectLayer,
            features: evt.features,
            operation: 'selected'
        };
        ME.callbackSelection(retVal);
    },

    onThemeFeatureSelected: function (evt) {
        var retVal = {
            name:'Theme',
            features: evt.layers[0].selectedFeatures,
            operation: 'selected'
        };
        ME.callbackSelection(retVal);
    },
    //SELECTION - END

    //BUFFER - START
    bufferLayer: null,
    
    bufferClear: function () {
        if (ME.bufferLayer) {
            ME.bufferLayer.removeAllFeatures();
        }
    },

    bufferSelection: function (distance, unit) {
        //require values
        if (!distance) {
            throw ("distance is required.");
            return null;
        }
        if (!unit) {
            throw ("unit is required.");
            return null;
        }

        if (ME.selectLayer.features.length < 1) {
            throw ("No selected features.")
            return null;
        }
        
        //create buffer layer if it doesnt exist
        if (!ME.bufferLayer) {
            var sm = new OpenLayers.StyleMap({
                default: {
                    fillColor: "red",
                    fillOpacity: 0.25,
                    strokeColor: "red",
                    pointRadius: 6
                }
            });
            ME.bufferLayer = new OpenLayers.Layer.Vector("Buffer", {
                styleMap:sm
            });
            ME.bufferLayer.displayInLayerSwitcher = true;
            ME.olMap.addLayer(ME.bufferLayer);
        }

        //convert units
        var newDistance = ME.convertDistanceToMapUnit(distance, unit);

        //clear buffer features
        ME.bufferClear();

        //create / draw buffer polygon(s)
        // - when to clear?
        var bufferRadius = newDistance;
        var bufferedFeatures = [];
        var bufferGeoms = [];
        var jsts_parser = new jsts.io.OpenLayersParser();
        $.each(ME.selectLayer.features, function () {
            //var currentLoc = new OpenLayers.Geometry.Point(this.geometry.x, this.geometry.y);
            //var bufferGeom = OpenLayers.Geometry.Polygon.createRegularPolygon(currentLoc, bufferRadius, 30, 0);

            var jsts_geom = jsts_parser.read(this.geometry);
            var buffer_geom = jsts_geom.buffer(bufferRadius);
            bufferGeom = jsts_parser.write(buffer_geom);

            bufferGeoms.push(bufferGeom);
        });
                
        //dissolve polygons if there are more than one
        var filterGeom;
        if (bufferGeoms.length == 1) {
            filterGeom = bufferGeoms[0];
        } else {
            var jsts_geomA;
            var jsts_gemoB;
            var jsts_result_geom;
            
            for (var i = 0; i < bufferGeoms.length; i++)
            {
                if(i==0)
                {
                    var jsts_geomA = jsts_parser.read(bufferGeoms[0]);
                }
                else
                {
                    var jsts_geomB = jsts_parser.read(bufferGeoms[i]);
                    jsts_result_geom = jsts_geomA.union(jsts_geomB);
                    jsts_geomA = jsts_result_geom;
                }
            }
            filterGeom = jsts_parser.write(jsts_result_geom); 
        }

        ME.bufferLayer.addFeatures(new OpenLayers.Feature.Vector(filterGeom));
        ME.bufferLayer.setVisibility(true);
        
        var pfilter = new OpenLayers.Filter.Spatial({
            type: OpenLayers.Filter.Spatial.INTERSECTS,
            value: filterGeom
        });

        ME.selectLayer.removeAllFeatures();
        var retVal = {
            name: ME.activeSelectLayer,
            features: null,
            operation: 'selectionstart'
        };
        ME.callbackSelection(retVal);
        $.each(ME.protocol, function (i, protocol) {
            protocol.read({
                filter: pfilter,
                callback: function (resp) {
                    if (resp.features) {
                        if (protocol.textpattern !== undefined) {
                            $.each(resp.features, function (i, feature) {
                                var displaytext = protocol.textpattern;
                                // replace template fields with actual values
                                $.each(feature.data, function (key, val) {
                                    displaytext = displaytext.replace("!-" + key.toString().toUpperCase() + "-!", val.toString());
                                });
                                feature.displaytext = (displaytext != "" ? displaytext : "unnamed");;
                            });
                        }
                        ME.selectLayer.addFeatures(resp.features);                        
                    }
                    var retVal = {
                        name: ME.activeSelectLayer,
                        features: resp.features,
                        operation: 'selected',
                        index: i
                    };
                    ME.callbackSelection(retVal);
                },
                scope: new OpenLayers.Strategy.BBOX()
            });
        });
    },
    //BUFFER - END

    //UTILITY - START
    convertDistanceToMapUnit: function (distance, unit) {
        //allowable units are m, km, ft, mi
        //convert to map units
        var mapUnit = ME.olMap.getUnits();
        var newDistance;
        var multiplier;
        if (!(mapUnit == unit)) {
            var mapUnitMetric = ((mapUnit == "m") || (mapUnit == "km")) ? true : false;
            var unitMetric = ((unit == "m") || (unit == "km")) ? true : false;

            if (mapUnitMetric && unitMetric) {
                if (mapUnit == "km") { //divide distance by 1000
                    multiplier = 1 / 1000;
                } else { // multiply distance by 1000
                    multiplier = 1 * 1000;
                }
            } else if (!mapUnitMetric && !unitMetric) {
                if (mapUnit == "mi") { //divide distance by 5280
                    multiplier = 1 / 5280;
                } else { //multiply distance by 5280
                    multiplier = 1 * 5280;
                }
            } else { //have to convert units
                var feetPerMeter = 3.28084;
                var meterPerFeet = 0.3048;

                if (mapUnitMetric) { //convert metric to US 
                    multiplier = (unit == "mi") ? 5280 * meterPerFeet : meterPerFeet;
                } else { //convert to metric
                    multiplier = (unit = "km") ? 1000 * feetPerMeter : feetPerMeter;
                }
            }
            newDistance = distance * multiplier;
        } else {
            newDistance = distance;
        }
        return newDistance;
    },

    //Get the centerX and Y in Spherical Mercator (900913)
    GetMapCenterSM: function() {
        return (ME.GetMapCenterLL()).transform(new OpenLayers.Projection("EPSG:4326"), new OpenLayers.Projection("EPSG:900913"));
    },

    //Get the center X and Y in Lat-Lon
    GetMapCenterLL: function() {

        var OLCenter = ME.olMap.getCenter();
            //Convert to LL
            var TheCenterLL = OLCenter.transform(new OpenLayers.Projection("EPSG:900913"), new OpenLayers.Projection("EPSG:4326"));
            Lat = TheCenterLL.lat;
            Lon = TheCenterLL.lon;
        
        return new OpenLayers.LonLat(Lon, Lat);
    },

    //Get the mapScale
    GetMapScale: function() {
        var Scale;
        //Get the center X and Y in Lat-Lon
        Scale = ME.olMap.getZoom();
        return Scale;
    }
    //UTILITY _ END
}

