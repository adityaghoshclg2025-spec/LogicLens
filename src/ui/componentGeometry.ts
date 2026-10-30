/**
 * Unified Component Geometry & Pin Position System
 * 
 * Establishes ONE authoritative calculation for component dimensions,
 * visual pin coordinates, and wire connection endpoints.
 * 
 * Guarantee:
 * - Every port dot center is at (comp.x + pin.x, comp.y + pin.y)
 * - Every wire endpoint is at (comp.x + pin.x, comp.y + pin.y)
 * - Every SVG gate lead line terminates at (pin.x, pin.y)
 * - Zero gaps, zero detachment, zero coordinate divergence.
 */

import { isConfigurableGate } from '../component.js';

export interface PinDef {
  pinType: 'input' | 'output';
  pinIndex: number;
  x: number; // relative to component top-left (0..width)
  y: number; // relative to component top-left (0..height)
  label: string;
}

export interface ComponentLayout {
  width: number;
  height: number;
  inputs: PinDef[];
  outputs: PinDef[];
}

export function getComponentDimensions(type: string, inputCount: number): { width: number; height: number } {
  const upper = type.toUpperCase();
  if (isConfigurableGate(upper)) {
    const height = inputCount > 2 ? 76 + (inputCount - 2) * 20 : 76;
    return { width: 130, height };
  }
  if (upper === 'NOT' || upper === 'BUFFER') {
    return { width: 120, height: 60 };
  }
  if (upper === 'DFF') {
    return { width: 130, height: 84 };
  }
  if (upper === 'INPUT' || upper === 'OUTPUT' || upper === 'CLOCK') {
    return { width: 110, height: 56 };
  }
  return { width: 120, height: 60 };
}

export function getComponentPinLayout(type: string, inputCount: number, outputCount: number): ComponentLayout {
  const upper = type.toUpperCase();
  const { width, height } = getComponentDimensions(upper, inputCount);
  const inputs: PinDef[] = [];
  const outputs: PinDef[] = [];

  if (isConfigurableGate(upper)) {
    // Configurable Gates (AND, OR, NAND, NOR, XOR, XNOR)
    for (let i = 0; i < inputCount; i++) {
      let pinY: number;
      if (inputCount === 2) {
        pinY = i === 0 ? 34 : 58;
      } else {
        pinY = 34 + i * 20;
      }
      const label = inputCount <= 4 ? ['A', 'B', 'C', 'D'][i] : `In${i}`;
      inputs.push({ pinType: 'input', pinIndex: i, x: 0, y: pinY, label });
    }

    // Centered output pin
    const outY = inputCount === 2 ? 46 : 34 + ((inputCount - 1) * 20) / 2;
    outputs.push({ pinType: 'output', pinIndex: 0, x: width, y: outY, label: 'Y' });
  } else if (upper === 'NOT' || upper === 'BUFFER') {
    inputs.push({ pinType: 'input', pinIndex: 0, x: 0, y: 38, label: 'A' });
    outputs.push({ pinType: 'output', pinIndex: 0, x: width, y: 38, label: 'Y' });
  } else if (upper === 'DFF') {
    inputs.push({ pinType: 'input', pinIndex: 0, x: 0, y: 34, label: 'D' });
    inputs.push({ pinType: 'input', pinIndex: 1, x: 0, y: 60, label: 'CLK' });
    outputs.push({ pinType: 'output', pinIndex: 0, x: width, y: 47, label: 'Q' });
  } else if (upper === 'INPUT') {
    outputs.push({ pinType: 'output', pinIndex: 0, x: width, y: 36, label: 'Out' });
  } else if (upper === 'OUTPUT') {
    inputs.push({ pinType: 'input', pinIndex: 0, x: 0, y: 36, label: 'In' });
  } else if (upper === 'CLOCK') {
    outputs.push({ pinType: 'output', pinIndex: 0, x: width, y: 36, label: 'CLK' });
  } else {
    // Default fallback
    for (let i = 0; i < inputCount; i++) {
      inputs.push({ pinType: 'input', pinIndex: i, x: 0, y: 30 + i * 20, label: `In${i}` });
    }
    for (let j = 0; j < outputCount; j++) {
      outputs.push({ pinType: 'output', pinIndex: j, x: width, y: 30 + j * 20, label: `Out${j}` });
    }
  }

  return { width, height, inputs, outputs };
}

export function calculatePinWorldCoordinates(
  compX: number,
  compY: number,
  type: string,
  inputCount: number,
  outputCount: number,
  pinType: 'input' | 'output',
  pinIndex: number
): { x: number; y: number } {
  const layout = getComponentPinLayout(type, inputCount, outputCount);
  const pinList = pinType === 'input' ? layout.inputs : layout.outputs;
  const pin = pinList.find((p) => p.pinIndex === pinIndex);
  if (!pin) {
    // Fallback if index not found
    return {
      x: pinType === 'input' ? compX : compX + layout.width,
      y: compY + 36
    };
  }
  return {
    x: compX + pin.x,
    y: compY + pin.y
  };
}
