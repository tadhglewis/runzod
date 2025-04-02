// JS cast functions that should NOT be transformed
function formatData(value: any) {
  return String(value);
}

function getValue() {
  return Number("42");
}
