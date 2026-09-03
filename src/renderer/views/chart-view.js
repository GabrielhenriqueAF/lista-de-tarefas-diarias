import { element, emptyState, formatMinutes } from './dom.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function svgElement(name) {
  return document.createElementNS(SVG_NAMESPACE, name);
}

export function renderBarChart(items) {
  const wrapper = element('section', { className: 'chart' });
  if (!items.length) return emptyState('Sem dados neste período.');
  const svg = svgElement('svg');
  svg.setAttribute('viewBox', `0 0 360 ${items.length * 40}`);
  svg.setAttribute('role', 'img');
  const maximum = Math.max(1, ...items.map((item) => item.value));
  items.forEach((item, index) => {
    const y = index * 40;
    const label = svgElement('text');
    label.setAttribute('x', '0');
    label.setAttribute('y', String(y + 15));
    label.textContent = item.label;
    const bar = svgElement('rect');
    bar.setAttribute('x', '105');
    bar.setAttribute('y', String(y));
    bar.setAttribute('width', String((item.value / maximum) * 210));
    bar.setAttribute('height', '22');
    bar.setAttribute('rx', '5');
    bar.setAttribute('class', 'chart-bar');
    bar.setAttribute('aria-label', `${item.label}: ${formatMinutes(item.value)}`);
    const value = svgElement('text');
    value.setAttribute('x', String(320));
    value.setAttribute('y', String(y + 15));
    value.textContent = formatMinutes(item.value);
    svg.append(label, bar, value);
  });
  wrapper.append(svg);
  return wrapper;
}

export function renderLineChart(items) {
  const wrapper = element('section', { className: 'chart' });
  if (!items.length) return emptyState('Sem dados neste período.');
  const svg = svgElement('svg');
  svg.setAttribute('viewBox', '0 0 360 150');
  svg.setAttribute('role', 'img');
  const maximum = Math.max(1, ...items.map((item) => item.value));
  const points = items.map((item, index) => `${20 + (index * 320) / Math.max(1, items.length - 1)},${125 - (item.value / maximum) * 100}`).join(' ');
  const line = svgElement('polyline');
  line.setAttribute('points', points);
  line.setAttribute('class', 'chart-line');
  line.setAttribute('fill', 'none');
  svg.append(line);
  wrapper.append(svg);
  return wrapper;
}

