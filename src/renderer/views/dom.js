export function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.type) node.type = options.type;
  if (options.name) node.name = options.name;
  if (options.value !== undefined) node.value = options.value;
  if (options.placeholder) node.placeholder = options.placeholder;
  if (options.dataset) Object.entries(options.dataset).forEach(([key, value]) => { node.dataset[key] = value; });
  if (options.attributes) Object.entries(options.attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

export function labeled(labelText, control) {
  const label = element('label', { className: 'field' });
  label.append(element('span', { text: labelText }), control);
  return label;
}

export function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export function formatClock(value) {
  return value?.slice(11, 16) ?? '';
}

export function formatMinutes(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function emptyState(text) {
  return element('p', { className: 'empty', text });
}

