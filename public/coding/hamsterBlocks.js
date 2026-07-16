/* ============================================================================
 * HAMSTER HAVEN — hamsterBlocks.js
 * The block CATALOG for Coding Mode. Drop-in replacement for Ctrl+Create's
 * blockDefs.js: sets CtrlCreate.categories / defs / defList / defsByCategory,
 * so the vendored editor (palette, blockRender, workspace) renders these
 * blocks with zero changes.
 *
 * Design: the program drives a grid "robot" hamster in the 3D world you built.
 * Motion is discrete (one grid cell / 90° turns). Sensing queries the real
 * Hamster Haven world (walls = colliders, seeds = seed meshes, nest = a House).
 *
 * Events / Control / Operators / Variables reuse Ctrl+Create opcodes verbatim
 * so their semantics (and the interpreter's eval logic) stay identical.
 * Motion / Act / Sensing are hamster-specific and implemented by coding.js.
 * ==========================================================================*/
(function () {
  "use strict";

  // Same category ids + colors as Ctrl+Create (so blocks.css / palette match),
  // a few relabelled. Sound / Pen / Juice are intentionally dropped.
  const CATEGORIES = [
    { id: "events",    label: "Events",    color: "#FFBF00", edge: "#CC9900" },
    { id: "motion",    label: "Move",      color: "#4C97FF", edge: "#3373CC" },
    { id: "looks",     label: "Act",       color: "#9966FF", edge: "#774DCB" },
    { id: "control",   label: "Control",   color: "#FFAB19", edge: "#CF8B17" },
    { id: "sensing",   label: "Sense",     color: "#5CB1D6", edge: "#2E8EB8" },
    { id: "operators", label: "Operators", color: "#59C059", edge: "#389438" },
    { id: "variables", label: "Variables", color: "#FF8C1A", edge: "#DB6E00" },
  ];

  const num = (d) => ({ type: "number", default: d });
  const txt = (d) => ({ type: "text", default: d });
  const dd = (opts, d) => ({ type: "dropdown", options: opts, default: d != null ? d : opts[0][1] });
  const ddt = (token, d) => ({ type: "dropdown", options: token, default: d });
  const bool = () => ({ type: "boolean" });

  const KEYS = [["space","space"],["up arrow","up arrow"],["down arrow","down arrow"],
                ["left arrow","left arrow"],["right arrow","right arrow"],["any","any"]];
  const DIRS = [["north","north"],["east","east"],["south","south"],["west","west"]];
  const EMOTES = [["love","love"],["happy","happy"],["sleep","sleep"],["alert","alert"]];

  const DEFS = [
    /* ----------------------------------------------------------- EVENTS */
    { opcode: "event_flag", category: "events", shape: "hat",
      text: "when ⚑ clicked", args: {}, help: "Start when you press Go." },
    { opcode: "event_key", category: "events", shape: "hat",
      text: "when %KEY key pressed", args: { KEY: dd(KEYS) }, help: "Start on a key press." },
    { opcode: "event_whenbroadcast", category: "events", shape: "hat",
      text: "when I hear %MSG", args: { MSG: ddt("MESSAGES", "message1") }, help: "Start on a signal." },
    { opcode: "event_broadcast", category: "events", shape: "stack",
      text: "shout %MSG", args: { MSG: ddt("MESSAGES", "message1") }, help: "Send a signal to other scripts." },
    { opcode: "event_broadcastwait", category: "events", shape: "stack",
      text: "shout %MSG and wait", args: { MSG: ddt("MESSAGES", "message1") }, help: "Send a signal and wait for it to finish." },

    /* ------------------------------------------------------------- MOVE */
    { opcode: "motion_forward", category: "motion", shape: "stack",
      text: "walk forward %STEPS", args: { STEPS: num(1) }, help: "Walk forward this many grid squares." },
    { opcode: "motion_back", category: "motion", shape: "stack",
      text: "walk back %STEPS", args: { STEPS: num(1) }, help: "Walk backward this many squares." },
    { opcode: "motion_turnright", category: "motion", shape: "stack",
      text: "turn right ↻", args: {}, help: "Turn a quarter-turn clockwise." },
    { opcode: "motion_turnleft", category: "motion", shape: "stack",
      text: "turn left ↺", args: {}, help: "Turn a quarter-turn counter-clockwise." },
    { opcode: "motion_hop", category: "motion", shape: "stack",
      text: "hop", args: {}, help: "Hop forward — clears a small gap or ledge." },
    { opcode: "motion_face", category: "motion", shape: "stack",
      text: "face %DIR", args: { DIR: dd(DIRS) }, help: "Face north, east, south, or west." },
    { opcode: "motion_gonest", category: "motion", shape: "stack",
      text: "go home to nest", args: {}, help: "Walk back to the nest (a House you built)." },
    { opcode: "motion_col", category: "motion", shape: "reporter", text: "column", args: {}, help: "Grid column the hamster is on." },
    { opcode: "motion_row", category: "motion", shape: "reporter", text: "row", args: {}, help: "Grid row the hamster is on." },
    { opcode: "motion_heading", category: "motion", shape: "reporter", text: "facing", args: {}, help: "Which way the hamster faces." },

    /* -------------------------------------------------------------- ACT */
    { opcode: "looks_grab", category: "looks", shape: "stack",
      text: "grab seed", args: {}, help: "Stuff a seed on this square into your cheeks." },
    { opcode: "looks_stash", category: "looks", shape: "stack",
      text: "stash seeds", args: {}, help: "Empty your cheeks into the nest (must be at the nest)." },
    { opcode: "looks_sniff", category: "looks", shape: "stack", text: "sniff", args: {}, help: "Sniff around — a cute pause." },
    { opcode: "looks_squeak", category: "looks", shape: "stack", text: "squeak", args: {}, help: "Let out an adorable squeak." },
    { opcode: "looks_emote", category: "looks", shape: "stack",
      text: "show %EMOTE", args: { EMOTE: dd(EMOTES) }, help: "Pop an emote bubble." },
    { opcode: "looks_say", category: "looks", shape: "stack",
      text: "say %MSG", args: { MSG: txt("Hi!") }, help: "Show a speech bubble." },
    { opcode: "looks_sayfor", category: "looks", shape: "stack",
      text: "say %MSG for %SECS seconds", args: { MSG: txt("Hi!"), SECS: num(2) }, help: "Show a speech bubble for a while." },

    /* ------------------------------------------------------------ SENSE */
    { opcode: "sensing_seedahead", category: "sensing", shape: "boolean", text: "seed ahead?", args: {}, help: "Is there a seed on the next square?" },
    { opcode: "sensing_seedhere", category: "sensing", shape: "boolean", text: "on a seed?", args: {}, help: "Is there a seed on this square?" },
    { opcode: "sensing_wallahead", category: "sensing", shape: "boolean", text: "wall ahead?", args: {}, help: "Is the next square blocked?" },
    { opcode: "sensing_canhop", category: "sensing", shape: "boolean", text: "can hop?", args: {}, help: "Can the hamster hop forward from here?" },
    { opcode: "sensing_atnest", category: "sensing", shape: "boolean", text: "at nest?", args: {}, help: "Is the hamster standing at the nest?" },
    { opcode: "sensing_cheeks", category: "sensing", shape: "reporter", text: "seeds in cheeks", args: {}, help: "How many seeds are stuffed in the cheeks." },
    { opcode: "sensing_keypressed", category: "sensing", shape: "boolean",
      text: "key %KEY pressed?", args: { KEY: dd(KEYS.slice(0, 5)) }, help: "Is a key held down right now?" },
    { opcode: "sensing_timer", category: "sensing", shape: "reporter", text: "timer", args: {}, help: "Seconds since the program started." },
    { opcode: "sensing_resettimer", category: "sensing", shape: "stack", text: "reset timer", args: {}, help: "Set the timer back to zero." },

    /* ---------------------------------------------------------- CONTROL */
    { opcode: "control_wait", category: "control", shape: "stack",
      text: "wait %SECS seconds", args: { SECS: num(1) }, help: "Pause." },
    { opcode: "control_repeat", category: "control", shape: "c",
      text: "repeat %N", args: { N: num(4) }, help: "Loop a fixed number of times." },
    { opcode: "control_forever", category: "control", shape: "c",
      text: "forever", args: {}, help: "Loop endlessly." },
    { opcode: "control_if", category: "control", shape: "c",
      text: "if %COND then", args: { COND: bool() }, help: "Run if true." },
    { opcode: "control_ifelse", category: "control", shape: "c2",
      text: "if %COND then", args: { COND: bool() }, help: "Run one branch or the other." },
    { opcode: "control_waituntil", category: "control", shape: "stack",
      text: "wait until %COND", args: { COND: bool() }, help: "Pause until true." },
    { opcode: "control_repeatuntil", category: "control", shape: "c",
      text: "repeat until %COND", args: { COND: bool() }, help: "Loop until true." },
    { opcode: "control_stop", category: "control", shape: "cap",
      text: "stop %WHAT", args: { WHAT: dd([["all","all"],["this script","this script"]]) }, help: "Halt scripts." },

    /* -------------------------------------------------------- OPERATORS */
    { opcode: "operator_add", category: "operators", shape: "reporter", text: "%A + %B", args: { A: num(""), B: num("") }, help: "Add." },
    { opcode: "operator_subtract", category: "operators", shape: "reporter", text: "%A − %B", args: { A: num(""), B: num("") }, help: "Subtract." },
    { opcode: "operator_multiply", category: "operators", shape: "reporter", text: "%A × %B", args: { A: num(""), B: num("") }, help: "Multiply." },
    { opcode: "operator_divide", category: "operators", shape: "reporter", text: "%A ÷ %B", args: { A: num(""), B: num("") }, help: "Divide." },
    { opcode: "operator_random", category: "operators", shape: "reporter",
      text: "pick random %A to %B", args: { A: num(1), B: num(10) }, help: "Random integer." },
    { opcode: "operator_gt", category: "operators", shape: "boolean", text: "%A > %B", args: { A: num(""), B: num("50") }, help: "Greater than." },
    { opcode: "operator_lt", category: "operators", shape: "boolean", text: "%A < %B", args: { A: num(""), B: num("50") }, help: "Less than." },
    { opcode: "operator_eq", category: "operators", shape: "boolean", text: "%A = %B", args: { A: num(""), B: num("50") }, help: "Equal to." },
    { opcode: "operator_and", category: "operators", shape: "boolean", text: "%A and %B", args: { A: bool(), B: bool() }, help: "Both true." },
    { opcode: "operator_or", category: "operators", shape: "boolean", text: "%A or %B", args: { A: bool(), B: bool() }, help: "Either true." },
    { opcode: "operator_not", category: "operators", shape: "boolean", text: "not %A", args: { A: bool() }, help: "Invert." },
    { opcode: "operator_join", category: "operators", shape: "reporter", text: "join %A %B", args: { A: txt("hammy "), B: txt("ham") }, help: "Join text." },
    { opcode: "operator_mod", category: "operators", shape: "reporter", text: "%A mod %B", args: { A: num(""), B: num("") }, help: "Remainder." },
    { opcode: "operator_round", category: "operators", shape: "reporter", text: "round %A", args: { A: num("") }, help: "Round to integer." },

    /* -------------------------------------------------------- VARIABLES */
    { opcode: "data_setvar", category: "variables", shape: "stack",
      text: "set %VAR to %VAL", args: { VAR: ddt("VARS", "score"), VAL: txt("0") }, help: "Assign a variable." },
    { opcode: "data_changevar", category: "variables", shape: "stack",
      text: "change %VAR by %VAL", args: { VAR: ddt("VARS", "score"), VAL: num(1) }, help: "Add to a variable." },
    { opcode: "data_showvar", category: "variables", shape: "stack",
      text: "show variable %VAR", args: { VAR: ddt("VARS", "score") }, help: "Display it." },
    { opcode: "data_hidevar", category: "variables", shape: "stack",
      text: "hide variable %VAR", args: { VAR: ddt("VARS", "score") }, help: "Hide it." },
    { opcode: "data_variable", category: "variables", shape: "reporter",
      text: "%VAR", args: { VAR: ddt("VARS", "score") }, help: "Read a variable." },
  ];

  // Stitch category color onto each def, index by opcode, pre-tokenize —
  // identical to Ctrl+Create so the editor renders these unchanged.
  const byOpcode = {};
  const catColor = {};
  CATEGORIES.forEach((c) => { catColor[c.id] = c; });
  DEFS.forEach((d) => {
    d.tokens = CtrlCreate.tokenize(d.text);
    d.color = catColor[d.category].color;
    d.edge = catColor[d.category].edge;
    byOpcode[d.opcode] = d;
  });

  CtrlCreate.categories = CATEGORIES;
  CtrlCreate.defs = byOpcode;
  CtrlCreate.defList = DEFS;
  CtrlCreate.defsByCategory = function (cat) { return DEFS.filter((d) => d.category === cat); };
})();
