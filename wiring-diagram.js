class Config {
  height = 750;
  width = 1500;
  radius = 100;
  canvas_space = 50;
  y_offset = 20;
  padding = 50;
  scaling_threshold = 0.1;
  label_holder_opacity = 0.3;

  constructor(dark_mode = false) {
    this.dark_mode = dark_mode;
  }

  get label_y_offset() {
    // guessed based on performance
    return this.canvas_space / 2 - this.y_offset;
  }
  get fg_col() {
    return this.dark_mode ? "white" : "black";
  }
  get bg_col() {
    return this.dark_mode ? "black" : "white";
  }
  get fg_edge_col() {
    // DARK: blue grey, LIGHT: red grey
    return this.dark_mode ? "#ACE4F5" : "#ADADAD";
  }
  get fg_text_col() {
    return this.dark_mode ? this.fg_col : this.fg_col;
  }
  get leaf_col() {
    // DARK: green, LIGHT: blue
    return this.dark_mode ? "#48ff76" : "#0085fa";
  }
}

var config = new Config();

// var circle_data = [[width / 2, height / 2]];
var circle_data = [];

x = d3.scaleLinear().domain([0, config.width]).range([0, config.width]);
y = d3.scaleLinear().domain([0, config.height]).range([0, config.height]);

xAxis = d3.axisBottom(x);

yAxis = d3.axisRight(y);

const svg = d3
  .select("body")
  .append("svg")
  .attr("viewBox", [0, 0, config.width, config.height]);

view_debug_opacity = "0.0";
axis_debug_opacity = "0.0";

const view = svg
  .append("rect")
  .attr("class", "view")
  .attr("x", 0.5)
  .attr("y", 0.5)
  .attr("width", config.width - 1)
  .attr("height", config.height - 1)
  .attr(
    "style",
    `opacity: ${
      config.dark_mode ? 1.0 - view_debug_opacity : view_debug_opacity
    }`
  );

const gX = svg
  .append("g")
  .attr("class", "axis axis--x")
  .attr("style", `opacity: ${axis_debug_opacity}`)
  .call(xAxis);
const gY = svg
  .append("g")
  .attr("class", "axis axis--y")
  .attr("style", `opacity: ${axis_debug_opacity}`)
  .call(yAxis);
const wiring_diagram = svg
  .append("g")
  .attr("class", "wiring_diagram")
  .attr("transform", `translate(0,${config.y_offset})`);

const zoom = d3
  .zoom()
  .scaleExtent([1, 50])
  .translateExtent([
    [0, 0],
    [config.width, config.height],
  ])
  .filter(filter)
  .on("zoom", zoomed);

function zoomed({ transform }) {
  view.attr("transform", transform);
  gX.call(xAxis.scale(transform.rescaleX(x)));
  gY.call(yAxis.scale(transform.rescaleY(y)));
  transform.y += config.y_offset;
  wiring_diagram.attr("transform", transform);
}

function getDestNodeIds(d) {
  return d.data.dest_node_ids || [];
}

function reset() {
  svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}

Object.assign(svg.call(zoom).node(), { reset });

// prevent scrolling then apply the default filter
function filter(event) {
  event.preventDefault();
  return (!event.ctrlKey || event.type === "wheel") && !event.button;
}

const circles = wiring_diagram
  .selectAll("_")
  .data(circle_data)
  .enter()
  .append("circle")
  .attr("class", "node")
  .attr("r", 2 * config.radius)
  .attr("transform", function (d) {
    return "translate(" + d + ")";
  });

var pack = d3
  .pack()
  .size([config.width, config.height - config.canvas_space])
  .padding(config.padding);

function Pack(data) {
  const root = pack(
    d3
      .hierarchy(data)
      .sum((d) => d.value)
      .sort((a, b) => b.value - a.value)
  );
  var node = wiring_diagram
    .selectAll(".node")
    .data(root)
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("data-id", function (d) {
      return d.data.node_id;
    })
    .attr("transform", function (d) {
      return `translate(${d.x},${d.y})`;
    });
  node
    .append("circle")
    .attr("r", function (d) {
      return d.r;
    })
    .attr("class", function (d) {
      return d.height ? "parent" : "leaf";
    })
    .attr("data-depth", function (d) {
      return d.depth;
    })
    .attr("data-height", function (d) {
      return d.height;
    })
    .attr("data-value", function (d) {
      return d.value;
    })
    .attr("fill", function (d) {
      return d.children ? config.bg_col : config.leaf_col;
    })
    .attr("opacity", 0.25)
    .attr("stroke", config.fg_edge_col)
    .attr("stroke-width", 2);
  var label_holder = node.append("g").attr("class", function (d) {
    var is_leaf = d3.select(this.parentNode).select("circle").classed("leaf");
    return "label-box" + (is_leaf ? " leafy" : " parental");
  });
  var label = label_holder.append("text");
  label.text(function (d) {
    return d.data.name;
  });
  label.attr("data-scale_factor", function (d) {
    text_bbox = this.getBBox(); // bounding client rect misbehaves
    factor = fit_label_to_diameter(d, text_bbox);
    return factor > -config.scaling_threshold ? "1.0" : 1.0 - factor;
  });
  label
    .attr("style", function (d) {
      var scale = this.dataset.scale_factor;
      // console.log(`Scale: ${scale}`);
      return `font-size: ${scale}rem`;
    })
    .attr("fill", config.fg_text_col);
  label.attr("data-width", function (d) {
    return this.getBBox().width; // same as getComputedTextLength
  });
  label.attr("data-height", function (d) {
    return this.getBBox().height;
  });
  label.attr("class", "label").attr("data-transform", function (d) {
    text_width = this.dataset.width;
    text_height = this.dataset.height;
    text_bbox = this.getBBox(); // bounding client rect misbehaves
    downscale_factor = fit_label_to_diameter(d, text_bbox);
    var x_shift = -(text_width / 2); // * downscale_factor;
    var depth_direction = d.depth ? -1 : 1; // module name goes below
    var y_shift = d.children ? depth_direction * d.r : text_height / 4; // * downscale_factor;
    var data_transform = [x_shift, y_shift];
    return data_transform;
  });
  label.attr("class", "label").attr("transform", function (d) {
    [x_shift, y_shift] = this.dataset.transform.split(",");
    return `translate(${x_shift},${y_shift})`;
  });
  label_holder
    .insert("rect", "text")
    .attr("fill", function (holder) {
      var is_par = d3.select(this.parentNode).classed("parental");
      return is_par ? config.bg_col : "none";
    })
    .attr("fill-opacity", String(config.label_holder_opacity))
    .attr("width", function (holder) {
      return d3.select(this.parentNode).select("text").attr("data-width");
    })
    .attr("height", function (holder) {
      return d3.select(this.parentNode).select("text").attr("data-height");
    })
    .attr("transform", function (holder) {
      label = d3.select(this.parentNode).select("text");
      [x_shift, y_shift] = label.attr("data-transform").split(",");
      y_shift = parseFloat(y_shift) - config.y_offset - config.label_y_offset;
      return `translate(${x_shift},${y_shift})`;
    });
  var wire_group = node.append("g");
  wire_group
    .attr("class", "wire")
    .attr("start_node_id", function (d) {
      return d.data.node_id;
    })
    .attr("dest_node_ids", getDestNodeIds);
  wire_group
    .selectAll("_")
    .data(function (d) {
      // retain the original node alongside the IDs
      return getDestNodeIds(d).map((id) => [d, id]);
    })
    .enter()
    .append("path")
    .attr("dest_node_id", function (d) {
      let [node, node_id] = d;
      return node_id;
    })
    .attr("d", function (d) {
      // start the wire if we have a destination...
      let [node, node_id] = d;
      var wire_path = d3.path();
      wire_path.moveTo(0, node.r);
      // wire_path.lineTo(node.r * 2, node.r * 2);
      var dest_node = wiring_diagram.select(`g.node[data-id='${node_id}']`);
      bracket_regex = /\(([^)]*)\)/;
      var dest_loc = bracket_regex.exec(dest_node.attr("transform"))[1];
      var [dest_x, dest_y] = dest_loc.split(",");
      var rel_x = parseFloat(dest_x) - node.x;
      var rel_y = parseFloat(dest_y) - node.y;
      // console.log(`Paired with node ${node_id} at (${rel_x},${rel_y})`);
      // wire_path.lineTo(rel_x, rel_y);
      dest_radius = dest_node.select("circle").attr("r");
      rel_y += dest_radius;
      var cpx1 = rel_x / 2;
      var cpy1 = rel_x;
      // console.log("Curve check:", cpx1, cpy1, rel_x, rel_y);
      wire_path.quadraticCurveTo(cpx1, cpy1, rel_x, rel_y);
      // wire_path.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, rel_x, rel_y);
      var returned_path = node.data.dest_node_ids ? wire_path : null;
      return returned_path;
    })
    .attr("stroke", config.fg_col)
    .attr("fill", "none");
}

function fit_label_to_diameter(node, bbox) {
  diameter = node.r * 2;
  tightening_factor = (bbox.width - diameter) / diameter;
  // console.log(`Computed a scaling factor of ${tightening_factor}`, node, bbox);
  return tightening_factor;
}

var data;
var promised = d3.json("wd_sample_data.json").then(
  function (fetched) {
    // console.log(fetched);
    data = fetched;
    Pack(data);
  },
  function (failed) {
    console.debug("Fetch failed, falling back to stored JSON string");
    data = JSON.parse(
      '{"name":"Step Function", "node_id":0,"children":[{"name":"tabulate(event)","node_id":1,"children":[{"name":"states","node_id":2,"dest_node_ids":[4,6],"value":3}]},{"name":"Map Iterator","node_id":3,"children":[{"name":"state0(event)","node_id":4,"children":[{"name":"...","node_id":5,"value":1}]},{"name":"state1(event)","node_id":6,"children":[{"name":"...","node_id":7,"value":1}]}]}]}'
    );
    Pack(data);
  }
);
