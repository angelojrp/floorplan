const fs = require("fs");
const path = require("path");

// Read worker and convert ES module → CommonJS for Node.js testing
const code = fs.readFileSync(
  path.join(__dirname, "..", "api", "worker.js"),
  "utf8"
)
  // Convert named exports: export { a, b } => module.exports.a = a; ... etc
  .replace(
    /export\s*\{\s*([^}]+)\s*\};?/g,
    (_, names) =>
      names
        .split(",")
        .map((n) => `module.exports.${n.trim()} = ${n.trim()};`)
        .join("\n")
  )
  // Convert default export
  .replace("export default", "module.exports.default =");

const tmpFile = path.join(__dirname, "..", "api", "_worker_test.cjs");
fs.writeFileSync(tmpFile, code);

// Clear require cache and load
delete require.cache[require.resolve(tmpFile)];
const {
  parseYaml,
  validateFloorPlan,
  resolveLayout,
  renderSvg,
} = require(tmpFile);

// Test with all example YAML files
const examplesDir = path.join(__dirname, "..", "examples");
const files = fs
  .readdirSync(examplesDir)
  .filter((f) => f.endsWith(".yaml"));

let allOk = true;

for (const file of files) {
  const yaml = fs.readFileSync(path.join(examplesDir, file), "utf8");
  console.log(`\n=== ${file} ===`);

  try {
    const parsed = parseYaml(yaml);
    console.log("  parsed:", parsed.title || "(no title)");
    console.log("  rooms:", parsed.rooms?.length || 0);

    const validation = validateFloorPlan(parsed);
    if (!validation.valid) {
      console.log("  VALIDATION ERRORS:", validation.errors);
      allOk = false;
      continue;
    }

    const input = {
      version: 1,
      scale: parsed.scale,
      title: parsed.title,
      wallThickness: parsed.wallThickness || 15,
      grid: parsed.grid !== undefined ? parsed.grid : 100,
      rooms: parsed.rooms,
      walls: parsed.walls || [],
    };

    const resolved = resolveLayout(input);
    const svg = renderSvg(resolved);

    if (!svg.startsWith("<svg")) {
      console.log("  ERROR: SVG does not start with <svg");
      allOk = false;
    } else {
      console.log(`  SVG OK — ${svg.length} chars`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    console.log(e.stack?.split("\n").slice(0, 4).join("\n"));
    allOk = false;
  }
}

// Cleanup
fs.unlinkSync(tmpFile);

console.log(`\n${allOk ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
process.exit(allOk ? 0 : 1);
