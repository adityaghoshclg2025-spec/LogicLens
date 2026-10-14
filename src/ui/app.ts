import {
  Circuit,
  AND,
  OR,
  NAND,
  NOR,
  XOR,
  XNOR,
  NOT,
  BUFFER,
  INPUT,
  OUTPUT,
  DFF,
  makeClock,
  BUILTIN_GATES,
  ComponentDefinition,
  LogicValue,
  generateTruthTable,
  TruthTableResult,
  explainCircuit,
  buildTimingSignals,
  selectTimingSignals
} from '../index.js';
import { renderCircuitExplanationHTML } from './explainRenderer.js';

export interface ComponentSpec {
  width: number;
  height: number;
  headerHeight: number;
  pinSpacing: number;
  label: string;
}

export const COMPONENT_SPECS: Record<string, ComponentSpec> = {
  INPUT: { width: 110, height: 56, headerHeight: 22, pinSpacing: 0, label: 'Input Switch' },
  OUTPUT: { width: 110, height: 56, headerHeight: 22, pinSpacing: 0, label: 'Output Probe' },
  CLOCK: { width: 110, height: 56, headerHeight: 22, pinSpacing: 0, label: 'Clock' },
  NOT: { width: 120, height: 60, headerHeight: 22, pinSpacing: 20, label: 'NOT Inverter' },
  BUFFER: { width: 120, height: 60, headerHeight: 22, pinSpacing: 20, label: 'Buffer' },
  AND: { width: 130, height: 76, headerHeight: 22, pinSpacing: 24, label: 'AND Gate' },
  OR: { width: 130, height: 76, headerHeight: 22, pinSpacing: 24, label: 'OR Gate' },
  NAND: { width: 130, height: 76, headerHeight: 22, pinSpacing: 24, label: 'NAND Gate' },
  NOR: { width: 130, height: 76, headerHeight: 22, pinSpacing: 24, label: 'NOR Gate' },
  XOR: { width: 130, height: 76, headerHeight: 22, pinSpacing: 24, label: 'XOR Gate' },
  XNOR: { width: 130, height: 76, headerHeight: 22, pinSpacing: 24, label: 'XNOR Gate' },
  DFF: { width: 130, height: 84, headerHeight: 22, pinSpacing: 26, label: 'D Flip-Flop' },
};

export interface VisualComponent {
  id: string;
  simId: string;
  type: string;
  label: string;
  x: number;
  y: number;
  val?: LogicValue;
  inputCount: number;
  outputCount: number;
  width: number;
  height: number;
}

export interface VisualWire {
  id: string;
  fromCompId: string;
  fromPinIndex: number;
  toCompId: string;
  toPinIndex: number;
  netName: string;
}

export interface PortTarget {
  compId: string;
  pinType: 'input' | 'output';
  pinIndex: number;
  worldX: number;
  worldY: number;
}

export interface DraftWire {
  fromCompId: string;
  fromPinType: 'input' | 'output';
  fromPinIndex: number;
  startWorldX: number;
  startWorldY: number;
  currentWorldX: number;
  currentWorldY: number;
  targetPort: PortTarget | null;
  isValidTarget: boolean;
}

/**
 * LogicLens Interactive Circuit Editor UI Controller
 * Handles visual editing, consistent component sizing, port snapping,
 * orthogonal wire routing, wire deletion, and logic-sim-core engine binding.
 */
export class LogicLensUI {
  public circuit: Circuit;
  private isRunning: boolean = false;
  private simInterval: number | null = null;

  // Visual state maps
  private visualComponents: Map<string, VisualComponent> = new Map();
  private visualWires: Map<string, VisualWire> = new Map();

  // Viewport transformation state
  private panX: number = 0;
  private panY: number = 0;
  private zoom: number = 1.0;
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private snapToGrid: boolean = true;
  private readonly gridSize: number = 20;

  // Selection & dragging state
  private selectedCompId: string | null = null;
  private selectedWireId: string | null = null;
  private draggingCompId: string | null = null;
  private dragWorldOffsetX: number = 0;
  private dragWorldOffsetY: number = 0;

  // Interactive wiring state
  private draftWire: DraftWire | null = null;
  private explainedOutputId: string | null = null;
  private explanationActive = false;
  private selectedTimingNets = new Set<string>();
  private knownTimingNets = new Set<string>();
  private timingSelectionInitialized = false;

  constructor() {
    this.circuit = new Circuit();
    this.setupEventListeners();
    this.initDemoANDCircuit();
  }

  /**
   * Initializes standard AND gate verification test circuit:
   * INPUT A (1) ──\
   *                AND ──> OUTPUT (OUT)
   * INPUT B (1) ──/
   */
  public initDemoANDCircuit(): void {
    this.resetTimingSelection();
    this.circuit = new Circuit();
    this.visualComponents.clear();
    this.visualWires.clear();
    this.selectedCompId = null;
    this.selectedWireId = null;

    const compA = this.createVisualComponent('INPUT', 80, 80, 'Input A', '1');
    const compB = this.createVisualComponent('INPUT', 80, 220, 'Input B', '1');
    const compAnd = this.createVisualComponent('AND', 300, 140, 'AND Gate');
    const compOut = this.createVisualComponent('OUTPUT', 520, 150, 'Output Probe');

    // Create simulation wire connections
    this.createWireConnection(compA.id, 0, compAnd.id, 0);
    this.createWireConnection(compB.id, 0, compAnd.id, 1);
    this.createWireConnection(compAnd.id, 0, compOut.id, 0);

    this.selectedCompId = compAnd.id;
    this.settleSimulation();
  }

  /**
   * Initializes standard NOT gate verification test circuit:
   * INPUT A (0) ──> NOT ──> OUTPUT (OUT)
   */
  public initDemoNOTCircuit(): void {
    this.resetTimingSelection();
    this.circuit = new Circuit();
    this.visualComponents.clear();
    this.visualWires.clear();
    this.selectedCompId = null;
    this.selectedWireId = null;

    const compA = this.createVisualComponent('INPUT', 100, 140, 'Input A', '0');
    const compNot = this.createVisualComponent('NOT', 300, 138, 'NOT Inverter');
    const compOut = this.createVisualComponent('OUTPUT', 520, 140, 'Output Probe');

    this.createWireConnection(compA.id, 0, compNot.id, 0);
    this.createWireConnection(compNot.id, 0, compOut.id, 0);

    this.selectedCompId = compNot.id;
    this.settleSimulation();
  }

  /**
   * Helper to instantiate a visual component and register it in logic-sim-core.
   */
  public createVisualComponent(
    type: string,
    x: number,
    y: number,
    label?: string,
    initialVal: LogicValue = '0'
  ): VisualComponent {
    let def: ComponentDefinition<any> | undefined;
    if (type === 'CLOCK') {
      def = makeClock(5);
    } else {
      def = (BUILTIN_GATES as Record<string, ComponentDefinition<any>>)[type];
    }

    if (!def) {
      def = BUFFER;
    }

    const spec = COMPONENT_SPECS[type] || COMPONENT_SPECS.BUFFER;
    const simId = this.circuit.addComponent(def, label || spec.label);
    const visId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const visComp: VisualComponent = {
      id: visId,
      simId,
      type,
      label: label || spec.label,
      x,
      y,
      val: type === 'INPUT' ? initialVal : undefined,
      inputCount: def.inputCount,
      outputCount: def.outputCount,
      width: spec.width,
      height: spec.height
    };

    if (type === 'INPUT') {
      this.circuit.setInput(simId, initialVal);
    }

    this.visualComponents.set(visId, visComp);
    return visComp;
  }

  /**
   * Connects two visual components via output -> input pins in both UI and simulation engine.
   */
  public createWireConnection(
    fromCompId: string,
    fromPinIndex: number,
    toCompId: string,
    toPinIndex: number
  ): VisualWire | null {
    const fromComp = this.visualComponents.get(fromCompId);
    const toComp = this.visualComponents.get(toCompId);
    if (!fromComp || !toComp) return null;

    // Remove any existing wire connected to the target input pin (single driver per input)
    const existingWireOnTarget = Array.from(this.visualWires.values()).find(
      (w) => w.toCompId === toCompId && w.toPinIndex === toPinIndex
    );
    if (existingWireOnTarget) {
      this.deleteWire(existingWireOnTarget.id, false);
    }

    // Call logic-sim-core wire API to get or create the simulation net
    const netName = this.circuit.wire(fromComp.simId, fromPinIndex, toComp.simId, toPinIndex);
    const wireId = `wire_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const visWire: VisualWire = {
      id: wireId,
      fromCompId,
      fromPinIndex,
      toCompId,
      toPinIndex,
      netName
    };

    this.visualWires.set(wireId, visWire);
    return visWire;
  }

  /**
   * Calculates exact world center coordinates for a component port.
   * Guaranteed to match the visual center of .port-dot DOM elements.
   */
  public getPortCoordinates(
    comp: VisualComponent,
    pinType: 'input' | 'output',
    pinIndex: number
  ): { x: number; y: number } {
    if (pinType === 'input') {
      const x = comp.x;
      let y = comp.y + 36;
      if (comp.inputCount === 1) {
        y = comp.y + (comp.type === 'NOT' || comp.type === 'BUFFER' ? 38 : 36);
      } else if (comp.inputCount === 2) {
        y = pinIndex === 0 ? comp.y + 34 : comp.y + 58;
        if (comp.type === 'DFF') {
          y = pinIndex === 0 ? comp.y + 34 : comp.y + 60;
        }
      } else if (comp.inputCount > 2) {
        y = comp.y + 30 + pinIndex * 20;
      }
      return { x, y };
    } else {
      const x = comp.x + comp.width;
      let y = comp.y + 36;
      if (comp.outputCount === 1) {
        if (comp.inputCount === 2) {
          y = comp.y + 46;
        } else if (comp.type === 'NOT' || comp.type === 'BUFFER') {
          y = comp.y + 38;
        } else if (comp.type === 'DFF') {
          y = comp.y + 47;
        }
      } else if (comp.outputCount > 1) {
        y = comp.y + 30 + pinIndex * 20;
      }
      return { x, y };
    }
  }

  /**
   * Sets up interactive DOM event handlers.
   */
  private setupEventListeners(): void {
    // Simulation Controls
    document.getElementById('btn-run')?.addEventListener('click', () => this.startSimulation());
    document.getElementById('btn-pause')?.addEventListener('click', () => this.pauseSimulation());
    document.getElementById('btn-step')?.addEventListener('click', () => this.stepSimulation());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.resetSimulation());

    // Preset Demo Buttons
    document.getElementById('btn-demo-and')?.addEventListener('click', () => {
      this.initDemoANDCircuit();
      this.updateUI();
    });

    document.getElementById('btn-demo-not')?.addEventListener('click', () => {
      this.initDemoNOTCircuit();
      this.updateUI();
    });

    document.getElementById('btn-clear')?.addEventListener('click', () => {
      this.circuit = new Circuit();
      this.resetTimingSelection();
      this.visualComponents.clear();
      this.visualWires.clear();
      this.selectedCompId = null;
      this.selectedWireId = null;
      this.updateUI();
    });

    document.getElementById('btn-timing-select-all')?.addEventListener('click', () => {
      this.selectedTimingNets = new Set(Array.from(this.visualWires.values(), (wire) => wire.netName));
      this.timingSelectionInitialized = true;
      this.updateUI();
    });
    document.getElementById('btn-timing-clear-selection')?.addEventListener('click', () => {
      this.selectedTimingNets.clear();
      this.timingSelectionInitialized = true;
      this.updateUI();
    });
    document.getElementById('timing-signal-list')?.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const netName = target.getAttribute('data-timing-net');
      if (!netName) return;
      if (target.checked) this.selectedTimingNets.add(netName);
      else this.selectedTimingNets.delete(netName);
      this.timingSelectionInitialized = true;
      this.updateUI();
    });

    document.getElementById('btn-explain-circuit')?.addEventListener('click', () => {
      const selector = document.getElementById('explain-output-select') as HTMLSelectElement | null;
      this.explainedOutputId = selector?.value || null;
      this.explanationActive = true;
      this.updateCircuitExplanation();
    });
    document.getElementById('explain-output-select')?.addEventListener('change', (event) => {
      this.explainedOutputId = (event.currentTarget as HTMLSelectElement).value || null;
      if (this.explanationActive) this.updateCircuitExplanation();
    });

    // Truth Table Action Buttons & Modal Listeners
    document.getElementById('btn-truth-table')?.addEventListener('click', () => this.openTruthTableModal());
    document.getElementById('btn-generate-tt')?.addEventListener('click', () => this.generateTruthTableInTab());
    document.getElementById('btn-modal-recompute')?.addEventListener('click', () => this.updateTruthTableInModal());
    document.getElementById('btn-close-tt-modal')?.addEventListener('click', () => this.closeTruthTableModal());
    document.getElementById('btn-modal-close')?.addEventListener('click', () => this.closeTruthTableModal());
    document.getElementById('truth-table-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('truth-table-modal')) {
        this.closeTruthTableModal();
      }
    });

    // Sidebar Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabId = target.getAttribute('data-tab');
        if (!tabId) return;

        tabBtns.forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

        target.classList.add('active');
        document.getElementById(tabId)?.classList.add('active');

        if (tabId === 'tab-truthtable') {
          this.generateTruthTableInTab();
        }
      });
    });

    // Palette Search Filter
    const searchInput = document.getElementById('palette-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase();
      document.querySelectorAll('.palette-item').forEach((item) => {
        const name = item.querySelector('.item-name')?.textContent?.toLowerCase() || '';
        (item as HTMLElement).style.display = name.includes(query) ? 'flex' : 'none';
      });
    });

    // Palette Drag-and-Drop to Canvas
    const paletteItems = document.querySelectorAll('.palette-item');
    paletteItems.forEach((item) => {
      item.addEventListener('dragstart', (e: Event) => {
        const dragEvt = e as DragEvent;
        const type = (item as HTMLElement).getAttribute('data-type');
        if (type && dragEvt.dataTransfer) {
          dragEvt.dataTransfer.setData('text/plain', type);
          dragEvt.dataTransfer.effectAllowed = 'copy';
        }
      });
    });

    const canvasContainer = document.getElementById('circuit-canvas');
    if (canvasContainer) {
      canvasContainer.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      });

      canvasContainer.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const type = e.dataTransfer?.getData('text/plain');
        if (!type) return;

        const spec = COMPONENT_SPECS[type] || COMPONENT_SPECS.BUFFER;
        const rect = canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Center the placed component under the mouse drop coordinate
        let worldX = (mouseX - this.panX) / this.zoom - spec.width / 2;
        let worldY = (mouseY - this.panY) / this.zoom - spec.height / 2;

        if (this.snapToGrid) {
          worldX = Math.round(worldX / this.gridSize) * this.gridSize;
          worldY = Math.round(worldY / this.gridSize) * this.gridSize;
        }

        const newComp = this.createVisualComponent(type, worldX, worldY);
        this.selectedCompId = newComp.id;
        this.selectedWireId = null;
        this.settleSimulation();
      });

      // Mouse Wheel Zooming
      canvasContainer.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          e.preventDefault();
          const rect = canvasContainer.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
          const newZoom = Math.min(Math.max(0.4, this.zoom * zoomFactor), 2.5);

          this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
          this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
          this.zoom = newZoom;

          this.renderCanvas();
        },
        { passive: false }
      );

      // Canvas Mouse Down (Panning & Selection Clear)
      canvasContainer.addEventListener('mousedown', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const isBackground =
          target === canvasContainer ||
          target.id === 'canvas-viewport' ||
          target.id === 'wires-layer' ||
          target.id === 'nodes-layer';

        if (e.button === 1 || (e.button === 0 && isBackground)) {
          this.isPanning = true;
          this.panStartX = e.clientX - this.panX;
          this.panStartY = e.clientY - this.panY;
          canvasContainer.classList.add('panning');

          if (isBackground) {
            this.selectedCompId = null;
            this.selectedWireId = null;
            this.updateUI();
          }
        }
      });
    }

    // Global Mouse Move for Component Dragging, Viewport Panning, and Draft Wire Routing
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.renderCanvas();
        return;
      }

      if (canvasContainer) {
        const rect = canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const currWorldX = (mouseX - this.panX) / this.zoom;
        const currWorldY = (mouseY - this.panY) / this.zoom;

        // 1. Handling Active Draft Wire Dragging
        if (this.draftWire) {
          let candidateTarget: PortTarget | null = null;
          let isValid = false;

          // Scan all components for closest port dot within 24px snap radius
          this.visualComponents.forEach((comp) => {
            // Check input ports
            for (let i = 0; i < comp.inputCount; i++) {
              const coords = this.getPortCoordinates(comp, 'input', i);
              const dist = Math.hypot(currWorldX - coords.x, currWorldY - coords.y);
              if (dist < 24) {
                candidateTarget = {
                  compId: comp.id,
                  pinType: 'input',
                  pinIndex: i,
                  worldX: coords.x,
                  worldY: coords.y
                };
              }
            }
            // Check output ports
            for (let j = 0; j < comp.outputCount; j++) {
              const coords = this.getPortCoordinates(comp, 'output', j);
              const dist = Math.hypot(currWorldX - coords.x, currWorldY - coords.y);
              if (dist < 24) {
                candidateTarget = {
                  compId: comp.id,
                  pinType: 'output',
                  pinIndex: j,
                  worldX: coords.x,
                  worldY: coords.y
                };
              }
            }
          });

          if (candidateTarget) {
            const isDifferentComp = (candidateTarget as PortTarget).compId !== this.draftWire.fromCompId;
            const isOppositeType = (candidateTarget as PortTarget).pinType !== this.draftWire.fromPinType;
            isValid = isDifferentComp && isOppositeType;

            this.draftWire.currentWorldX = (candidateTarget as PortTarget).worldX;
            this.draftWire.currentWorldY = (candidateTarget as PortTarget).worldY;
            this.draftWire.targetPort = candidateTarget;
            this.draftWire.isValidTarget = isValid;
          } else {
            this.draftWire.currentWorldX = currWorldX;
            this.draftWire.currentWorldY = currWorldY;
            this.draftWire.targetPort = null;
            this.draftWire.isValidTarget = false;
          }

          this.renderWires();
          this.highlightPortDots();
          return;
        }

        // 2. Handling Active Component Dragging
        if (this.draggingCompId) {
          let targetWorldX = currWorldX - this.dragWorldOffsetX;
          let targetWorldY = currWorldY - this.dragWorldOffsetY;

          if (this.snapToGrid) {
            targetWorldX = Math.round(targetWorldX / this.gridSize) * this.gridSize;
            targetWorldY = Math.round(targetWorldY / this.gridSize) * this.gridSize;
          }

          const comp = this.visualComponents.get(this.draggingCompId);
          if (comp) {
            comp.x = targetWorldX;
            comp.y = targetWorldY;

            // Update DOM position directly without tearing down the entire DOM tree
            const nodeEl = document.querySelector(`[data-comp-node-id="${comp.id}"]`) as HTMLElement;
            if (nodeEl) {
              nodeEl.style.left = `${comp.x}px`;
              nodeEl.style.top = `${comp.y}px`;
            }

            // Immediately re-render SVG wires attached to moving ports
            this.renderWires();
          }
        }
      }
    });

    // Global Mouse Up for Wiring Completion & Component Drop
    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        canvasContainer?.classList.remove('panning');
      }

      if (this.draftWire) {
        if (this.draftWire.targetPort && this.draftWire.isValidTarget) {
          const fromType = this.draftWire.fromPinType;
          const targetType = this.draftWire.targetPort.pinType;

          let outCompId: string;
          let outPinIndex: number;
          let inCompId: string;
          let inPinIndex: number;

          if (fromType === 'output' && targetType === 'input') {
            outCompId = this.draftWire.fromCompId;
            outPinIndex = this.draftWire.fromPinIndex;
            inCompId = this.draftWire.targetPort.compId;
            inPinIndex = this.draftWire.targetPort.pinIndex;
          } else {
            outCompId = this.draftWire.targetPort.compId;
            outPinIndex = this.draftWire.targetPort.pinIndex;
            inCompId = this.draftWire.fromCompId;
            inPinIndex = this.draftWire.fromPinIndex;
          }

          const createdWire = this.createWireConnection(outCompId, outPinIndex, inCompId, inPinIndex);
          if (createdWire) {
            this.selectedWireId = createdWire.id;
            this.selectedCompId = null;
          }
          this.settleSimulation();
        }

        this.draftWire = null;
        this.renderCanvas();
      }

      if (this.draggingCompId) {
        this.draggingCompId = null;
        this.updateInspector();
      }
    });

    // Canvas Viewport Controls Overlay
    document.getElementById('zoom-in')?.addEventListener('click', () => {
      this.zoom = Math.min(2.5, this.zoom * 1.25);
      this.renderCanvas();
    });

    document.getElementById('zoom-out')?.addEventListener('click', () => {
      this.zoom = Math.max(0.4, this.zoom * 0.8);
      this.renderCanvas();
    });

    document.getElementById('reset-view')?.addEventListener('click', () => {
      this.zoom = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.renderCanvas();
    });

    document.getElementById('toggle-grid')?.addEventListener('click', (e) => {
      this.snapToGrid = !this.snapToGrid;
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active', this.snapToGrid);
      canvasContainer?.classList.toggle('no-grid', !this.snapToGrid);
    });

    document.getElementById('btn-delete')?.addEventListener('click', () => {
      if (this.selectedCompId) {
        this.deleteComponent(this.selectedCompId);
      } else if (this.selectedWireId) {
        this.deleteWire(this.selectedWireId);
      }
    });

    // Keyboard Controls: Delete / Backspace / Escape
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputActive =
        activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
      if (isInputActive) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedCompId) {
          e.preventDefault();
          this.deleteComponent(this.selectedCompId);
        } else if (this.selectedWireId) {
          e.preventDefault();
          this.deleteWire(this.selectedWireId);
        }
      } else if (e.key === 'Escape') {
        if (this.draftWire) {
          this.draftWire = null;
        }
        this.closeTruthTableModal();
        this.selectedCompId = null;
        this.selectedWireId = null;
        this.updateUI();
      }
    });
  }

  /**
   * Highlights port dots during active draft wire connection.
   */
  private highlightPortDots(): void {
    const allPortDots = document.querySelectorAll('.port-dot');
    allPortDots.forEach((dot) => {
      dot.classList.remove('target-valid', 'target-invalid');
      if (this.draftWire && this.draftWire.targetPort) {
        const compId = dot.getAttribute('data-comp-id');
        const pinType = dot.getAttribute('data-pin-type');
        const pinIndex = parseInt(dot.getAttribute('data-pin-index') || '0', 10);

        if (
          compId === this.draftWire.targetPort.compId &&
          pinType === this.draftWire.targetPort.pinType &&
          pinIndex === this.draftWire.targetPort.pinIndex
        ) {
          dot.classList.add(this.draftWire.isValidTarget ? 'target-valid' : 'target-invalid');
        }
      }
    });
  }

  /**
   * Deletes a visual component and unhooks all connected simulation nets.
   */
  public deleteComponent(compId: string): void {
    const comp = this.visualComponents.get(compId);
    if (!comp) return;

    // 1. Remove all connected wires
    const connectedWires = Array.from(this.visualWires.values()).filter(
      (w) => w.fromCompId === compId || w.toCompId === compId
    );
    connectedWires.forEach((w) => this.deleteWire(w.id, false));

    // 2. Remove simulation component from engine
    this.circuit.removeComponent(comp.simId);

    // 3. Remove visual component record
    this.visualComponents.delete(compId);

    if (this.selectedCompId === compId) {
      this.selectedCompId = null;
    }

    this.settleSimulation();
  }

  /**
   * Deletes a visual wire and unwires connection in logic-sim-core.
   */
  public deleteWire(wireId: string, autoStep: boolean = true): void {
    const wire = this.visualWires.get(wireId);
    if (!wire) return;

    const fromComp = this.visualComponents.get(wire.fromCompId);
    const toComp = this.visualComponents.get(wire.toCompId);

    if (fromComp && toComp) {
      this.circuit.unwire(fromComp.simId, wire.fromPinIndex, toComp.simId, wire.toPinIndex, wire.netName);
    }

    this.visualWires.delete(wireId);

    if (this.selectedWireId === wireId) {
      this.selectedWireId = null;
    }

    if (autoStep) {
      this.settleSimulation();
    }
  }

  public startSimulation(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    document.getElementById('btn-run')?.setAttribute('disabled', 'true');
    document.getElementById('btn-pause')?.removeAttribute('disabled');

    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (dot) dot.className = 'dot running';
    if (text) text.textContent = 'RUNNING';

    this.simInterval = window.setInterval(() => {
      this.stepSimulation();
    }, 250);
  }

  public pauseSimulation(): void {
    this.isRunning = false;
    if (this.simInterval) clearInterval(this.simInterval);

    document.getElementById('btn-run')?.removeAttribute('disabled');
    document.getElementById('btn-pause')?.setAttribute('disabled', 'true');

    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (dot) dot.className = 'dot stopped';
    if (text) text.textContent = 'PAUSED';
  }

  public stepSimulation(): void {
    try {
      const targetTime = this.circuit.time + 1;
      this.circuit.run(targetTime);
      this.updateUI();
    } catch (err: any) {
      this.pauseSimulation();
      const dot = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot) dot.className = 'dot oscillation';
      if (text) text.textContent = 'OSCILLATION ERROR';
      alert(`Simulation Error: ${err.message}`);
    }
  }

  /**
   * Settles all cascading combinational logic events across series gates.
   */
  public settleSimulation(): void {
    try {
      this.circuit.settle();
      this.updateUI();
    } catch (err: any) {
      this.pauseSimulation();
      const dot = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot) dot.className = 'dot oscillation';
      if (text) text.textContent = 'OSCILLATION ERROR';
      alert(`Simulation Error: ${err.message}`);
    }
  }

  public resetSimulation(): void {
    this.pauseSimulation();
    this.initDemoANDCircuit();
  }

  /**
   * Toggles binary input switch state ('0' <-> '1') and settles all connected downstream gates.
   */
  public toggleInput(visCompId: string): void {
    const comp = this.visualComponents.get(visCompId);
    if (!comp || comp.type !== 'INPUT') return;

    const newVal: LogicValue = comp.val === '1' ? '0' : '1';
    comp.val = newVal;

    // Send updated value to logic-sim-core backend
    this.circuit.setInput(comp.simId, newVal);

    // Completely settle all cascading combinational gates in sequence
    this.settleSimulation();
  }

  /**
   * Computes orthogonal EDA path string between two port points.
   * Handles forward routing and reverse loop-around routing cleanly.
   */
  public calculateOrthogonalPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const stub = 20;

    // Target is to the right with comfortable routing room
    if (x2 >= x1 + stub * 2) {
      const midX = Math.round(x1 + dx / 2);
      return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
    }

    // Target is behind or vertically adjacent -> route around cleanly
    const midY = dy >= 0 ? Math.max(y1, y2) + 26 : Math.min(y1, y2) - 26;
    const stub1 = x1 + stub;
    const stub2 = x2 - stub;
    return `M ${x1} ${y1} H ${stub1} V ${midY} H ${stub2} V ${y2} H ${x2}`;
  }

  /**
   * Renders only the SVG wires layer and draft wire.
   */
  private renderWires(): void {
    const wiresLayer = document.getElementById('wires-layer');
    if (!wiresLayer) return;

    wiresLayer.innerHTML = '';

    // Count fan-outs per source port to render junction indicators
    const portFanOutCount = new Map<string, number>();
    this.visualWires.forEach((wire) => {
      const key = `${wire.fromCompId}_${wire.fromPinIndex}`;
      portFanOutCount.set(key, (portFanOutCount.get(key) || 0) + 1);
    });

    // 1. Render permanent SVG wires
    this.visualWires.forEach((wire) => {
      const fromComp = this.visualComponents.get(wire.fromCompId);
      const toComp = this.visualComponents.get(wire.toCompId);
      if (!fromComp || !toComp) return;

      const p1 = this.getPortCoordinates(fromComp, 'output', wire.fromPinIndex);
      const p2 = this.getPortCoordinates(toComp, 'input', wire.toPinIndex);
      const netVal = this.circuit.getNetValue(wire.netName);

      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', this.calculateOrthogonalPath(p1.x, p1.y, p2.x, p2.y));
      pathEl.setAttribute('fill', 'none');

      let color = '#475569';
      if (netVal === '1') color = '#38bdf8';
      else if (netVal === '0') color = '#334155';
      else if (netVal === 'X') color = '#f43f5e';
      else if (netVal === 'Z') color = '#fbbf24';

      const isSelected = this.selectedWireId === wire.id;
      pathEl.className.baseVal = `wire-path ${isSelected ? 'selected' : ''}`;
      pathEl.setAttribute('stroke', isSelected ? '#38bdf8' : color);
      pathEl.setAttribute('stroke-width', isSelected ? '4' : netVal === '1' ? '3' : '2.5');

      if (netVal === '1' && !isSelected) {
        pathEl.setAttribute('filter', 'drop-shadow(0 0 5px #38bdf8)');
      }

      // Wire selection listener
      pathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedWireId = wire.id;
        this.selectedCompId = null;
        this.updateUI();
      });

      wiresLayer.appendChild(pathEl);

      // Render junction indicator if fan-out > 1
      const fanOut = portFanOutCount.get(`${wire.fromCompId}_${wire.fromPinIndex}`) || 0;
      if (fanOut > 1) {
        const junctionEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        junctionEl.setAttribute('cx', p1.x.toString());
        junctionEl.setAttribute('cy', p1.y.toString());
        junctionEl.setAttribute('r', '4');
        junctionEl.setAttribute('fill', color);
        junctionEl.setAttribute('stroke', '#0b0e14');
        junctionEl.setAttribute('stroke-width', '1.5');
        wiresLayer.appendChild(junctionEl);
      }
    });

    // 2. Render Draft Wire while dragging connection
    if (this.draftWire) {
      const draftPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const { startWorldX, startWorldY, currentWorldX, currentWorldY, fromPinType, targetPort, isValidTarget } =
        this.draftWire;

      let p1X = startWorldX;
      let p1Y = startWorldY;
      let p2X = currentWorldX;
      let p2Y = currentWorldY;

      if (fromPinType === 'input') {
        p1X = currentWorldX;
        p1Y = currentWorldY;
        p2X = startWorldX;
        p2Y = startWorldY;
      }

      draftPath.setAttribute('d', this.calculateOrthogonalPath(p1X, p1Y, p2X, p2Y));
      draftPath.setAttribute('fill', 'none');
      const isInvalid = targetPort !== null && !isValidTarget;
      const isValid = targetPort !== null && isValidTarget;
      draftPath.className.baseVal = `draft-wire ${isValid ? 'valid' : isInvalid ? 'invalid' : ''}`;

      wiresLayer.appendChild(draftPath);
    }
  }

  /**
   * Renders components, connection ports, SVG wires, draft wire, and selection outlines.
   */
  private renderCanvas(): void {
    const viewportEl = document.getElementById('canvas-viewport');
    const nodesLayer = document.getElementById('nodes-layer');
    if (!viewportEl || !nodesLayer) return;

    viewportEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;

    nodesLayer.innerHTML = '';

    // 1. Render Component Nodes & Port Dots
    this.visualComponents.forEach((comp) => {
      const nodeEl = document.createElement('div');
      const isSelected = this.selectedCompId === comp.id;
      nodeEl.className = `circuit-node ${comp.type.toLowerCase()}-node ${isSelected ? 'selected' : ''}`;
      nodeEl.setAttribute('data-comp-node-id', comp.id);
      nodeEl.style.left = `${comp.x}px`;
      nodeEl.style.top = `${comp.y}px`;
      nodeEl.style.width = `${comp.width}px`;
      nodeEl.style.height = `${comp.height}px`;

      // Node selection & drag initiation
      nodeEl.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.classList.contains('toggle-btn') || target.classList.contains('port-dot')) return;

        e.stopPropagation();
        this.selectedCompId = comp.id;
        this.selectedWireId = null;
        this.draggingCompId = comp.id;

        const canvasContainer = document.getElementById('circuit-canvas');
        if (canvasContainer) {
          const rect = canvasContainer.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const mouseWorldX = (mouseX - this.panX) / this.zoom;
          const mouseWorldY = (mouseY - this.panY) / this.zoom;

          this.dragWorldOffsetX = mouseWorldX - comp.x;
          this.dragWorldOffsetY = mouseWorldY - comp.y;
        }

        this.updateUI();
      });

      // Component Header
      const headerEl = document.createElement('div');
      headerEl.className = 'node-header';
      headerEl.innerHTML = `
        <span class="node-title">${comp.label}</span>
        <span class="node-type">${comp.type}</span>
      `;
      nodeEl.appendChild(headerEl);

      // Component Body
      const bodyEl = document.createElement('div');
      bodyEl.className = 'node-body';

      if (comp.type === 'INPUT') {
        const portCoords = this.getPortCoordinates(comp, 'output', 0);
        const relY = portCoords.y - comp.y;
        bodyEl.innerHTML = `
          <div class="input-ctrl">
            <button class="toggle-btn val-${comp.val || '0'}" title="Toggle Switch (0 / 1)">${comp.val || '0'}</button>
          </div>
          <div class="port-dot ${this.isPortConnected(comp.id, 'output', 0) ? 'connected' : ''}"
               style="position:absolute; left:100%; top:${relY}px; transform:translate(-50%, -50%);"
               data-comp-id="${comp.id}" data-pin-type="output" data-pin-index="0"
               title="Output Port (Drag to wire)"></div>
        `;
        const btn = bodyEl.querySelector('.toggle-btn');
        btn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleInput(comp.id);
        });
      } else if (comp.type === 'OUTPUT') {
        let probeVal: LogicValue = 'Z';
        const connectedWire = Array.from(this.visualWires.values()).find((w) => w.toCompId === comp.id);
        if (connectedWire) {
          probeVal = this.circuit.getNetValue(connectedWire.netName);
        }
        const portCoords = this.getPortCoordinates(comp, 'input', 0);
        const relY = portCoords.y - comp.y;

        bodyEl.innerHTML = `
          <div class="port-dot ${this.isPortConnected(comp.id, 'input', 0) ? 'connected' : ''}"
               style="position:absolute; left:0px; top:${relY}px; transform:translate(-50%, -50%);"
               data-comp-id="${comp.id}" data-pin-type="input" data-pin-index="0"
               title="Input Port (Drag to wire)"></div>
          <div class="output-ctrl">
            <span class="value-pill val-${probeVal}">${probeVal}</span>
          </div>
        `;
      } else if (comp.type === 'CLOCK') {
        let clkVal: LogicValue = '0';
        const clkNet = this.circuit.getComponent(comp.simId)?.outputNetIds[0];
        if (clkNet) {
          clkVal = this.circuit.getNetValue(clkNet);
        }
        const portCoords = this.getPortCoordinates(comp, 'output', 0);
        const relY = portCoords.y - comp.y;
        bodyEl.innerHTML = `
          <div class="clock-display">
            <span class="clock-badge">CLK</span>
            <span class="value-pill val-${clkVal}">${clkVal}</span>
          </div>
          <div class="port-dot ${this.isPortConnected(comp.id, 'output', 0) ? 'connected' : ''}"
               style="position:absolute; left:100%; top:${relY}px; transform:translate(-50%, -50%);"
               data-comp-id="${comp.id}" data-pin-type="output" data-pin-index="0"
               title="Clock Output Port"></div>
        `;
      } else {
        // Gates (AND, OR, NOT, NAND, NOR, XOR, XNOR, BUFFER, DFF)
        let inputDotsHtml = '';
        for (let i = 0; i < comp.inputCount; i++) {
          const coords = this.getPortCoordinates(comp, 'input', i);
          const relY = coords.y - comp.y;
          const pinLabel = comp.type === 'DFF' ? (i === 0 ? 'D' : 'CLK') : comp.inputCount > 1 ? `In${i}` : 'In';
          inputDotsHtml += `
            <div class="port-dot ${this.isPortConnected(comp.id, 'input', i) ? 'connected' : ''}"
                 style="position:absolute; left:0px; top:${relY}px; transform:translate(-50%, -50%);"
                 data-comp-id="${comp.id}" data-pin-type="input" data-pin-index="${i}"
                 title="Input ${i} (${pinLabel}) Port"></div>
            <span class="pin-text-label pin-in" style="position:absolute; left:8px; top:${relY}px; transform:translateY(-50%); font-size:0.625rem; color:var(--text-dim); font-family:var(--font-mono); pointer-events:none;">${pinLabel}</span>
          `;
        }

        let outputDotsHtml = '';
        for (let j = 0; j < comp.outputCount; j++) {
          const coords = this.getPortCoordinates(comp, 'output', j);
          const relY = coords.y - comp.y;
          const outLabel = comp.type === 'DFF' ? 'Q' : comp.outputCount > 1 ? `Out${j}` : 'Out';
          outputDotsHtml += `
            <div class="port-dot ${this.isPortConnected(comp.id, 'output', j) ? 'connected' : ''}"
                 style="position:absolute; left:100%; top:${relY}px; transform:translate(-50%, -50%);"
                 data-comp-id="${comp.id}" data-pin-type="output" data-pin-index="${j}"
                 title="Output ${j} (${outLabel}) Port"></div>
            <span class="pin-text-label pin-out" style="position:absolute; right:8px; top:${relY}px; transform:translateY(-50%); font-size:0.625rem; color:var(--text-dim); font-family:var(--font-mono); pointer-events:none;">${outLabel}</span>
          `;
        }

        // Center gate icon symbol
        let symbol = comp.type;
        if (comp.type === 'AND') symbol = '&';
        else if (comp.type === 'OR') symbol = '≥1';
        else if (comp.type === 'NOT') symbol = '1';
        else if (comp.type === 'BUFFER') symbol = 'BUF';
        else if (comp.type === 'NAND') symbol = '!&';
        else if (comp.type === 'NOR') symbol = '!≥1';
        else if (comp.type === 'XOR') symbol = '=1';
        else if (comp.type === 'XNOR') symbol = '!=1';
        else if (comp.type === 'DFF') symbol = 'DFF';

        bodyEl.innerHTML = `
          ${inputDotsHtml}
          <div class="gate-symbol-center">${symbol}</div>
          ${outputDotsHtml}
        `;
      }

      // Attach port mousedown listeners for wire creation
      const portDots = bodyEl.querySelectorAll('.port-dot');
      portDots.forEach((dot) => {
        const pinType = dot.getAttribute('data-pin-type') as 'input' | 'output';
        const pinIndex = parseInt(dot.getAttribute('data-pin-index') || '0', 10);

        dot.addEventListener('mousedown', (e: Event) => {
          const mouseEvt = e as MouseEvent;
          if (mouseEvt.button !== 0) return;
          mouseEvt.stopPropagation();

          const portCoords = this.getPortCoordinates(comp, pinType, pinIndex);
          this.draftWire = {
            fromCompId: comp.id,
            fromPinType: pinType,
            fromPinIndex: pinIndex,
            startWorldX: portCoords.x,
            startWorldY: portCoords.y,
            currentWorldX: portCoords.x,
            currentWorldY: portCoords.y,
            targetPort: null,
            isValidTarget: false
          };

          this.renderWires();
        });
      });

      nodeEl.appendChild(bodyEl);
      nodesLayer.appendChild(nodeEl);
    });

    // 2. Render all Wires
    this.renderWires();
  }

  private isPortConnected(compId: string, pinType: 'input' | 'output', pinIndex: number): boolean {
    return Array.from(this.visualWires.values()).some((w) => {
      if (pinType === 'input') {
        return w.toCompId === compId && w.toPinIndex === pinIndex;
      } else {
        return w.fromCompId === compId && w.fromPinIndex === pinIndex;
      }
    });
  }

  /**
   * Updates workspace panel UI elements.
   */
  public updateUI(): void {
    const timeEl = document.getElementById('sim-time');
    if (timeEl) timeEl.textContent = this.circuit.time.toString();

    this.renderCanvas();
    this.updateInspector();
    this.updateNetsTable();
    this.updateDiagnostics();
    this.updateCircuitExplanation();
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char] ?? char);
  }

  private updateCircuitExplanation(): void {
    const select = document.getElementById('explain-output-select') as HTMLSelectElement | null;
    const container = document.getElementById('circuit-explanation');
    if (!select || !container) return;

    const outputs = Array.from(this.visualComponents.values()).filter((component) => component.type === 'OUTPUT');
    const previous = this.explainedOutputId || select.value;
    select.innerHTML = outputs.length
      ? outputs.map((component) => `<option value="${this.escapeHtml(component.simId)}">${this.escapeHtml(component.label)}</option>`).join('')
      : '<option value="">No output probes</option>';
    if (outputs.some((component) => component.simId === previous)) select.value = previous;
    this.explainedOutputId = select.value || null;

    if (!this.explanationActive) return;
    if (!this.explainedOutputId) {
      container.innerHTML = '<p class="diag-desc">Add an output probe to explain a circuit.</p>';
      return;
    }
    const labels = new Map(Array.from(this.visualComponents.values(), (component) => [component.simId, component.label]));
    const result = explainCircuit(this.circuit, this.explainedOutputId, (componentId) => labels.get(componentId));
    if (!result) {
      container.innerHTML = '<p class="diag-desc">Select a valid output probe.</p>';
      return;
    }
    const detailsWereOpen = container.querySelector('details')?.open ?? false;
    container.innerHTML = renderCircuitExplanationHTML(result);
    const details = container.querySelector('details');
    if (details) details.open = detailsWereOpen;
  }

  private updateInspector(): void {
    const container = document.getElementById('inspector-content');
    const deleteBtn = document.getElementById('btn-delete') as HTMLButtonElement | null;
    if (!container) return;

    if (!this.selectedCompId && !this.selectedWireId) {
      if (deleteBtn) deleteBtn.disabled = true;
      container.innerHTML = `
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <p>Select any component or wire on the canvas to inspect its parameters and state.</p>
        </div>
      `;
      return;
    }

    if (deleteBtn) deleteBtn.disabled = false;

    if (this.selectedWireId) {
      const wire = this.visualWires.get(this.selectedWireId);
      if (!wire) return;

      const fromComp = this.visualComponents.get(wire.fromCompId);
      const toComp = this.visualComponents.get(wire.toCompId);
      const val = this.circuit.getNetValue(wire.netName);

      container.innerHTML = `
        <div class="inspector-prop-group">
          <div class="prop-row">
            <span class="prop-label">Selection:</span>
            <span class="prop-value" style="color: var(--accent-cyan);">Visual Wire</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Wire ID:</span>
            <span class="prop-value">${wire.id}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Sim Net:</span>
            <span class="prop-value">${wire.netName}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Signal Level:</span>
            <span class="prop-value"><span class="value-pill val-${val}">${val}</span></span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Driver Source:</span>
            <span class="prop-value">${fromComp ? fromComp.label : wire.fromCompId} (Out${wire.fromPinIndex})</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Target Reader:</span>
            <span class="prop-value">${toComp ? toComp.label : wire.toCompId} (In${wire.toPinIndex})</span>
          </div>
          <div style="margin-top: 0.75rem; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
            <button id="inspector-delete-btn" class="btn btn-secondary" style="width: 100%; justify-content: center; color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.4);">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete Wire
            </button>
          </div>
        </div>
      `;

      document.getElementById('inspector-delete-btn')?.addEventListener('click', () => {
        if (this.selectedWireId) this.deleteWire(this.selectedWireId);
      });
      return;
    }

    if (this.selectedCompId) {
      const comp = this.visualComponents.get(this.selectedCompId);
      if (!comp) return;

      container.innerHTML = `
        <div class="inspector-prop-group">
          <div class="prop-row">
            <span class="prop-label">Selection:</span>
            <span class="prop-value" style="color: var(--accent-cyan);">Component</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Visual ID:</span>
            <span class="prop-value">${comp.id}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Engine Sim ID:</span>
            <span class="prop-value">${comp.simId}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Type:</span>
            <span class="prop-value">${comp.type}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Label:</span>
            <span class="prop-value">${comp.label}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Dimensions:</span>
            <span class="prop-value">${comp.width}px × ${comp.height}px</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Position:</span>
            <span class="prop-value">X: ${Math.round(comp.x)}, Y: ${Math.round(comp.y)}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Ports:</span>
            <span class="prop-value">${comp.inputCount} In / ${comp.outputCount} Out</span>
          </div>
          <div style="margin-top: 0.75rem; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
            <button id="inspector-delete-btn" class="btn btn-secondary" style="width: 100%; justify-content: center; color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.4);">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete Component
            </button>
          </div>
        </div>
      `;

      document.getElementById('inspector-delete-btn')?.addEventListener('click', () => {
        if (this.selectedCompId) this.deleteComponent(this.selectedCompId);
      });
    }
  }

  private updateNetsTable(): void {
    const tbody = document.getElementById('nets-list-tbody');
    if (!tbody) return;

    const wireList = Array.from(this.visualWires.values());
    this.renderTimingDiagram(wireList);
    if (wireList.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="color: var(--text-dim); text-align:center;">No wires connected</td></tr>';
      return;
    }

    tbody.innerHTML = wireList
      .map((wire) => {
        const val = this.circuit.getNetValue(wire.netName);
        const fromComp = this.visualComponents.get(wire.fromCompId);
        const toComp = this.visualComponents.get(wire.toCompId);
        return `
        <tr>
          <td>${wire.netName}</td>
          <td><span class="value-pill val-${val}">${val}</span></td>
          <td>${fromComp?.label || 'Source'}</td>
          <td>${toComp?.label || 'Reader'}</td>
        </tr>
      `;
      })
      .join('');

  }

  private renderTimingDiagram(wires: VisualWire[]): void {
    const container = document.getElementById('waveform-preview');
    const selectionList = document.getElementById('timing-signal-list');
    if (!container || !selectionList) return;

    const byNet = new Map<string, { connections: string[] }>();
    for (const wire of wires) {
      const source = this.visualComponents.get(wire.fromCompId);
      const target = this.visualComponents.get(wire.toCompId);
      if (!source || !target) continue;
      const connection = `${source.label}.Out${wire.fromPinIndex} → ${target.label}.In${wire.toPinIndex}`;
      const existing = byNet.get(wire.netName);
      if (existing) existing.connections.push(connection);
      else byNet.set(wire.netName, { connections: [connection] });
    }

    const signals = buildTimingSignals(Array.from(byNet, ([netName, info]) => ({
      netName,
      label: info.connections.join(' · '),
      history: this.circuit.getHistory(netName)
    })));
    const currentNames = new Set(signals.map((signal) => signal.netName));
    const wasAllSelected = this.selectedTimingNets.size === this.knownTimingNets.size &&
      Array.from(this.knownTimingNets).every((netName) => this.selectedTimingNets.has(netName));
    for (const netName of this.selectedTimingNets) {
      if (!currentNames.has(netName)) this.selectedTimingNets.delete(netName);
    }
    if (!this.timingSelectionInitialized) {
      this.selectedTimingNets = new Set(currentNames);
      this.timingSelectionInitialized = true;
    } else if (wasAllSelected) {
      for (const netName of currentNames) this.selectedTimingNets.add(netName);
    }
    this.knownTimingNets = currentNames;

    selectionList.innerHTML = signals.length
      ? signals.map((signal) => `<label class="timing-signal-option"><input type="checkbox" data-timing-net="${this.escapeHtml(signal.netName)}" ${this.selectedTimingNets.has(signal.netName) ? 'checked' : ''}><span>${this.escapeHtml(signal.label)}</span><small>${this.escapeHtml(signal.netName)}</small></label>`).join('')
      : '<div class="waveform-empty">Connect wires to choose signals.</div>';

    if (signals.length === 0) {
      container.innerHTML = '<div class="waveform-empty">Connect circuit signals to view their timing.</div>';
      return;
    }

    const displayedSignals = selectTimingSignals(signals, this.selectedTimingNets);
    if (displayedSignals.length === 0) {
      container.innerHTML = '<div class="waveform-empty">Select one or more signals above to display their timing.</div>';
      return;
    }

    const labelWidth = 230;
    const tickWidth = 28;
    const timeEnd = Math.max(20, this.circuit.time);
    const plotWidth = timeEnd * tickWidth;
    const svgWidth = labelWidth + plotWidth + 28;
    const rowHeight = 54;
    const top = 28;
    const axisHeight = 26;
    const svgHeight = top + displayedSignals.length * rowHeight + axisHeight;
    const xAt = (time: number) => labelWidth + Math.min(timeEnd, Math.max(0, time)) * tickWidth;
    const yAt = (row: number, value: string) => {
      const y = top + row * rowHeight;
      if (value === '1') return y + 12;
      if (value === '0') return y + 38;
      if (value === 'X') return y + 22;
      return y + 30;
    };
    const colors: Record<string, string> = { '0': '#94a3b8', '1': '#34d399', X: '#f43f5e', Z: '#fbbf24' };
    const tickStep = Math.max(1, Math.ceil(timeEnd / 10));
    let svg = `<svg class="timing-svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="Timing diagram of ${displayedSignals.length} circuit signals">`;
    svg += `<rect width="${svgWidth}" height="${svgHeight}" fill="#111622"/>`;

    const ticks: number[] = [];
    for (let time = 0; time <= timeEnd; time += tickStep) ticks.push(time);
    if (ticks[ticks.length - 1] !== timeEnd) ticks.push(timeEnd);
    for (const time of ticks) {
      const x = xAt(time);
      svg += `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${top + displayedSignals.length * rowHeight - 7}" stroke="#263247" stroke-width="1"/>`;
      svg += `<text x="${x}" y="${top + displayedSignals.length * rowHeight + 13}" text-anchor="middle" class="timing-axis-label">${time}</text>`;
    }
    svg += `<line x1="${xAt(this.circuit.time)}" y1="${top - 8}" x2="${xAt(this.circuit.time)}" y2="${top + displayedSignals.length * rowHeight - 7}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 3"/>`;

    displayedSignals.forEach((signal, row) => {
      const rowTop = top + row * rowHeight;
      svg += `<line x1="0" y1="${rowTop + rowHeight - 1}" x2="${svgWidth}" y2="${rowTop + rowHeight - 1}" stroke="#263247"/>`;
      const shortLabel = signal.label.length > 36 ? `${signal.label.slice(0, 33)}…` : signal.label;
      svg += `<text x="8" y="${rowTop + 16}" class="timing-label" title="${this.escapeHtml(signal.label)}">${this.escapeHtml(shortLabel)}</text>`;
      svg += `<text x="8" y="${rowTop + 36}" class="timing-net-label">${this.escapeHtml(signal.netName)} · ${this.circuit.getNetValue(signal.netName)}</text>`;

      const transitions = signal.transitions;
      for (let i = 0; i < transitions.length; i++) {
        const current = transitions[i];
        const next = transitions[i + 1];
        const startX = xAt(current.time);
        const endX = next ? xAt(next.time) : xAt(timeEnd);
        const y = yAt(row, current.value);
        if (endX > startX) {
          svg += `<line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" stroke="${colors[current.value]}" stroke-width="3"/>`;
          if ((current.value === 'X' || current.value === 'Z') && endX - startX > 24) {
            svg += `<text x="${startX + 5}" y="${y - 4}" fill="${colors[current.value]}" class="timing-value-label">${current.value}</text>`;
          }
        }
        if (next) {
          const nextY = yAt(row, next.value);
          if (nextY !== y) svg += `<line x1="${endX}" y1="${y}" x2="${endX}" y2="${nextY}" stroke="${colors[next.value]}" stroke-width="2"/>`;
          if (next.time === current.time) svg += `<circle cx="${endX}" cy="${nextY}" r="2.5" fill="${colors[next.value]}"/>`;
        }
      }
      svg += `<circle cx="${xAt(this.circuit.time)}" cy="${yAt(row, this.circuit.getNetValue(signal.netName))}" r="3" fill="#38bdf8"/>`;
    });
    svg += `<text x="${labelWidth + plotWidth / 2}" y="${svgHeight - 3}" text-anchor="middle" class="timing-axis-label">Simulation time (ticks)</text></svg>`;

    container.innerHTML = `<div class="timing-meta">${displayedSignals.length} of ${signals.length} signal${signals.length === 1 ? '' : 's'} · current time t=${this.circuit.time}</div><div class="timing-scroll">${svg}</div><div class="timing-legend"><span><i class="timing-swatch val-0"></i>0</span><span><i class="timing-swatch val-1"></i>1</span><span><i class="timing-swatch val-X"></i>X</span><span><i class="timing-swatch val-Z"></i>Z</span></div>`;
  }

  private resetTimingSelection(): void {
    this.selectedTimingNets.clear();
    this.knownTimingNets.clear();
    this.timingSelectionInitialized = false;
  }

  private updateDiagnostics(): void {
    const floatingNets = this.circuit.findFloatingNets();
    const conflictedNets = this.circuit.findConflictedNets();

    const floatList = document.getElementById('floating-nets-list');
    if (floatList) {
      floatList.innerHTML =
        floatingNets.length === 0
          ? '<li style="color: var(--text-dim);">None detected ✓</li>'
          : floatingNets.map((n) => `<li style="color: var(--accent-amber);">${n}</li>`).join('');
    }

    const conflictList = document.getElementById('conflicted-nets-list');
    if (conflictList) {
      conflictList.innerHTML =
        conflictedNets.length === 0
          ? '<li style="color: var(--text-dim);">None detected ✓</li>'
          : conflictedNets.map((n) => `<li style="color: var(--accent-rose);">${n}</li>`).join('');
    }
  }

  /**
   * Automatically computes the truth table from current visual inputs and outputs.
   */
  public computeTruthTable(): TruthTableResult {
    const inputComponents = Array.from(this.visualComponents.values()).filter((c) => c.type === 'INPUT');
    const outputComponents = Array.from(this.visualComponents.values()).filter((c) => c.type === 'OUTPUT');

    // Sort inputs and outputs by canvas coordinates (top-to-bottom, left-to-right) for logical column ordering
    inputComponents.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    outputComponents.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

    const inputDescs = inputComponents.map((c) => ({
      id: c.simId,
      label: c.label || 'Input'
    }));

    const outputDescs = outputComponents.map((c) => ({
      id: c.simId,
      label: c.label || 'Output'
    }));

    // Generate table using logic-sim-core simulation engine
    const result = generateTruthTable(this.circuit, {
      inputs: inputDescs,
      outputs: outputDescs
    });

    // Ensure visual component switch states stay in sync after state restoration
    inputComponents.forEach((c) => {
      const comp = this.circuit.getComponent(c.simId);
      if (comp?.state?.value) {
        c.val = comp.state.value;
      }
    });

    return result;
  }

  /**
   * Generates formatted HTML for a TruthTableResult.
   */
  public renderTruthTableHTML(result: TruthTableResult): string {
    if (!result.success) {
      return `
        <div class="diag-card error" style="margin-top: 0.5rem;">
          <div class="diag-header">
            <span class="status-icon">✕</span>
            <strong>Truth Table Unavailable</strong>
          </div>
          <p class="diag-desc">${result.error || 'Unable to compute truth table.'}</p>
        </div>
      `;
    }

    let warningHtml = '';
    if (result.warnings.length > 0) {
      warningHtml = `
        <div class="diag-card warning" style="margin-bottom: 0.75rem;">
          <div class="diag-header">
            <span class="status-icon">!</span>
            <strong>Simulation Diagnostics</strong>
          </div>
          <ul class="diag-list">
            ${result.warnings.map((w) => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    const inThs = result.inputs.map((inLabel) => `<th class="tt-th-in">${inLabel}</th>`).join('');
    const outThs = result.outputs.map((outLabel) => `<th class="tt-th-out">${outLabel}</th>`).join('');

    const rowsHtml = result.rows
      .map((row, idx) => {
        const inTds = result.inputs
          .map((inLabel) => `<td><span class="value-pill val-${row.inputs[inLabel]}">${row.inputs[inLabel]}</span></td>`)
          .join('');
        const outTds = result.outputs
          .map((outLabel) => {
            const val = row.outputs[outLabel] ?? 'Z';
            return `<td><span class="value-pill val-${val}">${val}</span></td>`;
          })
          .join('');

        return `
          <tr>
            <td class="tt-td-idx" style="color: var(--text-dim); font-size: 0.7rem;">${idx}</td>
            ${inTds}
            <td class="tt-td-sep">➔</td>
            ${outTds}
          </tr>
        `;
      })
      .join('');

    return `
      ${warningHtml}
      <div class="tt-summary-bar">
        <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); border-color: rgba(56, 189, 248, 0.3);">
          ${result.inputs.length} Input${result.inputs.length === 1 ? '' : 's'} (${result.inputs.join(', ')})
        </span>
        <span class="badge" style="background: rgba(52, 211, 153, 0.15); color: var(--accent-emerald); border-color: rgba(52, 211, 153, 0.3);">
          ${result.outputs.length} Output${result.outputs.length === 1 ? '' : 's'} (${result.outputs.join(', ')})
        </span>
        <span class="badge" style="background: var(--bg-hover); color: var(--text-main);">
          ${result.totalCombinations} State${result.totalCombinations === 1 ? '' : 's'} (2<sup>${result.inputs.length}</sup>)
        </span>
      </div>
      <div class="nets-table-container tt-scroll-box" style="margin-top: 0.75rem; max-height: 380px; overflow-y: auto;">
        <table class="nets-table tt-table">
          <thead>
            <tr>
              <th style="width: 32px; color: var(--text-dim);">#</th>
              ${inThs}
              <th style="width: 20px; text-align: center; color: var(--text-dim);"></th>
              ${outThs}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Generates and renders the truth table in the right-side Truth Table tab.
   */
  public generateTruthTableInTab(): void {
    const container = document.getElementById('truth-table-results');
    if (!container) return;

    const result = this.computeTruthTable();
    container.innerHTML = this.renderTruthTableHTML(result);
    this.updateUI();
  }

  /**
   * Opens the expanded Truth Table modal dialog and computes results.
   */
  public openTruthTableModal(): void {
    const modal = document.getElementById('truth-table-modal');
    if (!modal) return;

    this.updateTruthTableInModal();
    modal.style.display = 'flex';
  }

  public closeTruthTableModal(): void {
    const modal = document.getElementById('truth-table-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  public updateTruthTableInModal(): void {
    const content = document.getElementById('modal-tt-content');
    if (!content) return;

    const result = this.computeTruthTable();
    content.innerHTML = this.renderTruthTableHTML(result);
    this.updateUI();
  }
}

// Initialize application on DOM ready if running in browser environment
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new LogicLensUI();
  });
}
