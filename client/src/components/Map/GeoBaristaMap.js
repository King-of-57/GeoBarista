import React, { createRef }  from 'react';
import { Map, TileLayer, GeoJSON, FeatureGroup } from 'react-leaflet';
import DrawTools from './DrawTools';
import ZoomLatLngBox from './ZoomLatLngBox';
import { booleanPointInPolygon } from '@turf/turf';
import { intersect } from '@turf/turf';
import { point, featureCollection, polygon } from '@turf/helpers';
import hash from 'object-hash';
import L from 'leaflet';
import 'leaflet-imageoverlay-rotated'

import { LeafletConsumer } from 'react-leaflet';
import { ContextMenu, MenuItem, ContextMenuTrigger } from "react-contextmenu";


/*const mapRef = createRef();
const geoJsonRef = createRef();*/

export default function GeoBaristaMap(props) {
    const {mapRef, geoJsonRef, classes, imageMenuOpen, images, selectImageById, selectImagesById} = props;
    const [zoom, setZoom] =  React.useState(13);
    const [center, setCenter] = React.useState({
        lat: 45.51,
        lng: -122.505
    })
    // const [mouse, setMouse] = React.useState({
    //     lat: 51.505,
    //     lng: -0.09
    // })
    const [viewPort, setViewPort] = React.useState({
        center: center,
        zoom: zoom
    });
    const [selectionGeoJSONs, setSelectionGeoJSONs] = React.useState({
    });
    const selectByGeoJSON = (geojson) => {
        const group = geoJsonRef.current.leafletElement;
        let select = [];
        let unselect = [];
        group.eachLayer((layer) => {
            var poly = layer.feature;
            if(intersect(geojson, poly, {ignoreBoundary: true})){
                select.push(layer.feature.properties.id)
            }
            else {
                unselect.push(layer.feature.properties.id)
            }
        })
        selectImagesById({
            select: select,
            unselect: unselect
        });
    }
    const handleOnClick = (e) => {
        const group = geoJsonRef?.current?.leafletElement;
        let select = [];
        let unselect = [];
        var pt = point([e.latlng.lng, e.latlng.lat]);
        group.eachLayer((layer) => {
            //console.log('layer', layer);
            let poly = layer.feature;
            if(booleanPointInPolygon(pt, poly, {ignoreBoundary: true})){
                //console.log('select')
                select.push(layer.feature.properties.id)
            }
            else {
                unselect.push(layer.feature.properties.id)
            }
        })
        selectImagesById({
            select: select,
            unselect: unselect
        });
    }
    // const handleOnMouseMove = (e) => {
    //     if(!mapRef.current) return;
    //     setMouse(e.latlng);
    // }
    const handleContextMenu = (e) => {
        alert("You right-clicked inside the div!");
    }
    const handleZoom = (e) => {
        if(!mapRef.current) return;
        setZoom(mapRef.current.leafletElement.getZoom());
    }
    const onViewPortChanged = (viewport) => {
        console.log(viewport)
        setViewPort({
            zoom: viewport.zoom,
            center: {
                lat: viewport.center[0],
                lng: viewport.center[1]
            }
        });
    }
    // input  -> an image
    // output -> polygon in GeoJSON
    const get_poly_from_image = (image) => {
        try {
            var points = JSON.parse(image.points);
            points.push(points[0])
            var polyPoints = [];
            polyPoints.push(points);
            var poly = polygon(polyPoints, {
                id: image._id,
                selected: image.selected
            });
        } catch (error) {
            console.log("Error parsing JSON for points " + error);
            console.log("bad image: " + JSON.stringify(image));
            console.log("bad points: " + JSON.stringify(polyPoints));
            console.log("main images: ");
            console.log(images);
            var poly = [[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]];
        }
        
        
        return poly;
    }
    // input  -> images from DB
    // output -> feature collection in GeoJSON
    const get_data = (images) => {
        let all = [];
        images.slice(0).reverse().forEach((image) => {
            if(image.visible) {
                let poly = get_poly_from_image(image);
                all.push(poly)
            }
        });
        let collection = featureCollection(all);
        return collection;
    }
    const get_style = (feature) => {
        let style = {
            color: 'red',
            weight: 1,
            fillOpacity: 0
        }
        if(feature.properties.selected) {
            style.color = 'blue';
        }
        else {
            style.color = 'red';
        }
        return style;
    }

    return (
        <div>
        <ContextMenuTrigger id="same_unique_identifier" className={classes.contextMenuOptions}>
                <React.Fragment>
                    <main className={imageMenuOpen ? classes.mainShifted : classes.main}>
                        <Map
                            length={4}
                            // onmousemove={handleOnMouseMove}
                            onzoomend={handleZoom}
                            onclick={handleOnClick}
                            contextMenu={true}
                            contextmenuItems={[{
                                text: 'Marker item',
                                index: 0
                            }, {
                                separator: true,
                                index: 1
                            }]}

                            ref={mapRef}
                            style={{height: "100%", width: "100%", zindex: 0}}
                            zoomControl={false}
                            viewport={viewPort}
                            onViewportChanged={onViewPortChanged}
                        >
                            <TileLayer
                            attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <GeoJSON key={hash(images)} ref={geoJsonRef} data={get_data(images)} style={get_style}/>
                            <DrawTools selectByGeoJSON={selectByGeoJSON}/>
                        </Map>
                    </main>
                    <ZoomLatLngBox classes={classes} zoom={viewPort.zoom} latlng={viewPort.center}/>
                </React.Fragment>
            </ContextMenuTrigger>
            <ContextMenu id="same_unique_identifier" className={classes.contextMenuOptions}>
                <MenuItem>
                    ContextMenu Item 1
                </MenuItem>
                <MenuItem>
                    ContextMenu Item 2
                </MenuItem>
                <MenuItem divider />
                <MenuItem>
                    ContextMenu Item 3
                </MenuItem>
            </ContextMenu>
    </div>
    )
};
//<ContextMenuTrigger id="same_unique_identifier" className={classes.contextMenuOptions}>
//