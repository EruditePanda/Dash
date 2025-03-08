import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { DeckGL } from "@deck.gl/react";
import { GeoJsonLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl";
import DBSCAN from "ml-dbscan";
import Papa from "papaparse";
import * as arrow from "apache-arrow";
import tokml from "tokml";
import { parseString } from "xml2js";
import { FaGlobe } from "react-icons/fa";
import "./spinner.css";

const MAPBOX_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";
const ALTERNATIVE_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function App() {
  const [data, setData] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [useAlternativeTiles, setUseAlternativeTiles] = useState(!MAPBOX_ACCESS_TOKEN);

  const onDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setLoading(true);
    setProgress(10);
    const file = acceptedFiles[0];

    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentLoaded = Math.round((event.loaded / event.total) * 100);
        setProgress(percentLoaded);
      }
    };

    reader.onload = (e) => {
      setProgress(80);
      const content = e.target.result;
      if (file.name.endsWith(".json") || file.name.endsWith(".geojson")) {
        const geojson = JSON.parse(content);
        setData(geojson);
        clusterData(geojson);
      } else if (file.name.endsWith(".csv")) {
        Papa.parse(content, {
          header: true,
          dynamicTyping: true,
          complete: (result) => {
            const geojson = convertCSVtoGeoJSON(result.data);
            setData(geojson);
            clusterData(geojson);
          },
        });
      } else if (file.name.endsWith(".arrow")) {
        const arrowBuffer = new Uint8Array(e.target.result);
        const table = arrow.Table.from([arrowBuffer]);
        const geojson = convertArrowToGeoJSON(table);
        setData(geojson);
        clusterData(geojson);
      } else if (file.name.endsWith(".kml")) {
        parseString(content, (err, result) => {
          if (!err) {
            const geojson = convertKMLToGeoJSON(result);
            setData(geojson);
            clusterData(geojson);
          }
        });
      }
      setProgress(100);
      setTimeout(() => setLoading(false), 500);
    };
    if (file.name.endsWith(".arrow")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ".json,.geojson,.csv,.arrow,.kml" });

  const clusterData = (geojson) => {
    const points = geojson.features.map((f) => f.geometry.coordinates);
    const dbscan = new DBSCAN();
    const clusters = dbscan.fit(points, 0.05, 2);
    setClusters(clusters);
  };

  return (
    <div>
      <h2>Geospatial Clustering App</h2>
      <button onClick={() => setUseAlternativeTiles(!useAlternativeTiles)}>
        Toggle Map Provider
      </button>
      <div {...getRootProps()} style={{ border: "2px dashed #ccc", padding: "20px", textAlign: "center", cursor: "pointer" }}>
        <input {...getInputProps()} />
        {isDragActive ? <p>Drop the files here...</p> : <p>Drag & drop files here, or click to select</p>}
      </div>
      {loading && (
        <div className="spinner-container">
          <FaGlobe className="globe-spinner" />
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}
      <DeckGL initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }} controller={true} layers={layers}>
        <Map
          mapLib={import('maplibre-gl')}
          mapStyle={useAlternativeTiles ? ALTERNATIVE_TILE_URL : "mapbox://styles/mapbox/light-v10"}
          mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
        />
      </DeckGL>
    </div>
  );
}
