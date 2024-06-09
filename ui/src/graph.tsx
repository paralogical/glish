import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import * as vis from "vis-network";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div style={{ margin: "20px" }}>
      <h1>Graph</h1>
      <App />
    </div>
  </React.StrictMode>
);

async function fetchGraphData(): Promise<vis.Data> {
  const data = await fetch("/syllableGraphDisplayData.json");
  const json = (await data.json()) as vis.Data;
  const nodes = json.nodes as Array<vis.Node>;
  const start = nodes.find((n) => n.label == "Start");
  start!.x = 0;
  start!.y = 300;
  start!.fixed = true;
  // @ts-ignore
  start!.group = 4;

  const end = nodes.find((n) => n.label == "End");
  end!.x = 4000;
  end!.y = 300;
  end!.fixed = true;

  nodes.push({
    id: 10001,
    label: "onset",
    fixed: true,
    x: 1000,
    y: 300,
    // @ts-ignore
    group: 1,
    font: {
      size: 65,
      // @ts-ignore
      bold: true,
    },
  });
  nodes.push({
    id: 10002,
    label: "vowel",
    fixed: true,
    x: 2000,
    y: 300,
    // @ts-ignore
    group: 2,
    font: {
      size: 65,
      // @ts-ignore
      bold: true,
    },
  });
  nodes.push({
    id: 10003,
    label: "coda",
    fixed: true,
    x: 3000,
    y: 300,
    // @ts-ignore
    group: 3,
    font: {
      size: 65,
      // @ts-ignore
      bold: true,
    },
  });

  // @ts-ignore
  const onsets = nodes.filter((n) => n.group == 1);
  // @ts-ignore
  const vowels = nodes.filter((n) => n.group == 2);
  // @ts-ignore
  const codas = nodes.filter((n) => n.group == 3);

  (json.edges as Array<vis.Edge>).push(
    ...onsets.map((on) => ({
      from: 10001,
      to: on.id,
      value: 10000,
      hidden: true,
    }))
  );
  (json.edges as Array<vis.Edge>).push(
    ...vowels.map((on) => ({
      from: 10002,
      to: on.id,
      value: 10000,
      hidden: true,
    }))
  );
  (json.edges as Array<vis.Edge>).push(
    ...codas.map((on) => ({
      from: 10003,
      to: on.id,
      value: 10000,
      hidden: true,
    }))
  );

  console.log("got data:", json);
  return json as vis.Data;
}

const graphData = fetchGraphData();

export function App() {
  const [data, setGraphData] = useState<vis.Data | undefined>(undefined);
  useEffect(() => {
    graphData.then(setGraphData);
  }, []);
  if (data == null) {
    return <div>loading...</div>;
  }
  return <Graph data={data} />;
}

function Graph({ data }: { data: vis.Data }) {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (ref.current) {
      const network = new vis.Network(ref.current, data, {
        // @ts-ignore
        edges: { smooth: { forceDirection: "none" } },
        physics: {
          forceAtlas2Based: {
            centralGravity: 0.01,
            springLength: 50,
            springConstant: 0.1,
          },
          minVelocity: 0.75,
          solver: "forceAtlas2Based",
          // barnesHut: {
          //   springLength: 40,
          // },
        },
        nodes: {
          font: {
            size: 55,
          },
        },
      });
      network.on("stabilizationProgress", function (params) {
        setProgress((100 * params.iterations) / params.total);
      });
      network.once("stabilizationIterationsDone", function () {
        setProgress(100);
      });
      return () => network.destroy();
    }
  }, []);
  return (
    <div className="graph-container">
      {progress < 100 ? <ProgressBar pct={progress} /> : null}
      <div ref={ref} />
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="progres-bar"
      style={{ width: "300px", position: "relative", backgroundColor: "#DDD" }}
    >
      <div
        style={{
          backgroundColor: "#646cff",
          width: `${pct}%`,
          height: "10px",
          transition: "width 1s",
        }}
      ></div>
    </div>
  );
}
