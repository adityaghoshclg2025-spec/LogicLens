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
  LogicValue
} from '../index.js';

export interface ComponentSpec {
  width: number;
  height: number;
  headerHeight: number;
  pinSpacing: number;
  label: string;
}

export const COMPONENT_SPECS: Record<string, ComponentSpec> = {
  INPUT: { width: 100, height: 50, headerHeight: 24, pinSpacing: 0, label: 'Input Switch' },
  OUTPUT: { width: 100, height: 50, headerHeight: 24, pinSpacing: 0, label: 'Output Probe' },
  CLOCK: { width: 110, height: 50, headerHeight: 24, pinSpacing: 0, label: 'Clock' },
  NOT: { width: 120, height: 60, headerHeight: 26, pinSpacing: 20, label: 'NOT Inverter' },
  BUFFER: { width: 120, height: 60, headerHeight: 26, pinSpacing: 20, label: 'Buffer' },
  AND: { width: 130, height: 72, headerHeight: 26, pinSpacing: 20, label: 'AND Gate' },
  OR: { width: 130, height: 72, headerHeight: 26, pinSpacing: 20, label: 'OR Gate' },
  NAND: { width: 130, height: 72, headerHeight: 26, pinSpacing: 20, label: 'NAND Gate' },
  NOR: { width: 130, height: 72, headerHeight: 26, pinSpacing: 20, label: 'NOR Gate' },
  XOR: { width: 130, height: 72, headerHeight: 26, pinSpacing: 20, label: 'XOR Gate' },
  XNOR: { width: 130, height: 72, headerHeight: 26, pinSpacing: 20, label: 'XNOR Gate' },
  DFF: { width: 130, height: 80, headerHeight: 26, pinSpacing: 20, label: 'D Flip-Flop' },
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
class LogicLensUI {
  private circuit: Circuit;
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

  constructor() {
    this.circuit = new Circuit();
    this.initDemoANDCircuit();
    this.setupEventListeners();
    this.updateUI();
  }

  /**
   * Initializes standard AND gate verification test circuit:
   * INPUT A (1) ──\
   *                AND ──> OUTPUT (OUT)
   * INPUT B (1) ──/
   */
  private initDemoANDCircuit(): void {
    this.circuit = new Circuit();
    this.visualComponents.clear();
    this.visualWires.clear();
    this.selectedCompId = null;
    this.selectedWireId = null;

    const compA = this.createVisualComponent('INPUT', 80, 100, 'Input A', '1');
    const compB = this.createVisualComponent('INPUT', 80, 220, 'Input B', '1');
    const compAnd = this.createVisualComponent('AND', 300, 160, 'AND Gate');
    const compOut = this.createVisualComponent('OUTPUT', 520, 160, 'Output Probe');

    // Create simulation wire connections
    this.createWireConnection(compA.id, 0, compAnd.id, 0);
    this.createWireConnection(compB.id, 0, compAnd.id, 1);
    this.createWireConnection(compAnd.id, 0, compOut.id, 0);

    this.selectedCompId = compAnd.id;
    this.stepSimulation();
  }

  /**
   * Initializes standard NOT gate verification test circuit:
   * INPUT A (0) ──> NOT ──> OUTPUT (OUT)
   */
  private initDemoNOTCircuit(): void {
    this.circuit = new Circuit();
    this.visualComponents.clear();
    this.visualWires.clear();
    this.selectedCompId = null;
    this.selectedWireId = null;

    const compA = this.createVisualComponent('INPUT', 100, 150, 'Input A', '0');
    const compNot = this.createVisualComponent('NOT', 300, 145, 'NOT Inverter');
    const compOut = this.createVisualComponent('OUTPUT', 520, 150, 'Output Probe');

    this.createWireConnection(compA.id, 0, compNot.id, 0);
    this.createWireConnection(compNot.id, 0, compOut.id, 0);

    this.selectedCompId = compNot.id;
    this.stepSimulation();
  }

  /**
   * Helper to instantiate a visual component and register it in logic-sim-core.
   */
  private createVisualComponent(type: string, x: number, y: number, label?: string, initialVal: LogicValue = '0'): VisualComponent {
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
    const visId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

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
  private createWireConnection(fromCompId: string, fromPinIndex: number, toCompId: string, toPinIndex: number): VisualWire | null {
    const fromComp = this.visualComponents.get(fromCompId);
    const toComp = this.visualComponents.get(toCompId);
    if (!fromComp || !toComp) return null;

    // Remove any existing wire connected to the target input pin (single driver per input)
    const existingWireOnTarget = Array.from(this.visualWires.values()).find(
      (w) => w.toCompId === toCompId && w.toPinIndex === toPinIndex
    );
    if (existingWireOnTarget) {
      this.deleteWire(existingWireOnTarget.id);
    }

    // Call logic-sim-core wire API to get or create the simulation net
    const netName = this.circuit.wire(fromComp.simId, fromPinIndex, toComp.simId, toPinIndex);
    const wireId = `wire_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

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
   */
  private getPortCoordinates(comp: VisualComponent, pinType: 'input' | 'output', pinIndex: number): { x: number; y: number } {
    const spec = COMPONENT_SPECS[comp.type] || COMPONENT_SPECS.BUFFER;
    
    if (pinType === 'input') {
      const x = comp.x;
      let y = comp.y + comp.height / 2;
      if (comp.inputCount > 1) {
        const startY = spec.headerHeight + 12;
        y = comp.y + startY + pinIndex * spec.pinSpacing;
      }
      return { x, y };
    } else {
      const x = comp.x + comp.width;
      let y = comp.y + comp.height / 2;
      if (comp.outputCount > 1) {
        const startY = spec.headerHeight + 12;
        y = comp.y + startY + pinIndex * spec.pinSpacing;
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
      this.visualComponents.clear();
      this.visualWires.clear();
      this.selectedCompId = null;
      this.selectedWireId = null;
      this.updateUI();
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

    // Palette Drag-and-Drop
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

        const rect = canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let worldX = (mouseX - this.panX) / this.zoom;
        let worldY = (mouseY - this.panY) / this.zoom;

        if (this.snapToGrid) {
          worldX = Math.round(worldX / this.gridSize) * this.gridSize;
          worldY = Math.round(worldY / this.gridSize) * this.gridSize;
        }

        const newComp = this.createVisualComponent(type, worldX, worldY);
        this.selectedCompId = newComp.id;
        this.selectedWireId = null;
        this.stepSimulation();
      });

      // Mouse Wheel Zooming
      canvasContainer.addEventListener('wheel', (e: WheelEvent) => {
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
      }, { passive: false });

      // Canvas Mouse Down (Panning & Selection Reset)
      canvasContainer.addEventListener('mousedown', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const isBackground = target === canvasContainer || target.id === 'canvas-viewport' || target.id === 'wires-layer' || target.id === 'nodes-layer';

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

    // Global Mouse Move for Component Moving, Canvas Panning, and Draft Wire Dragging
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

        // Draft Wire Mouse Move
        if (this.draftWire) {
          let candidateTarget: PortTarget | null = null;
          let isValid = false;

          // Scan all components for closest port dot within 20px snap radius
          this.visualComponents.forEach((comp) => {
            // Check input ports
            for (let i = 0; i < comp.inputCount; i++) {
              const coords = this.getPortCoordinates(comp, 'input', i);
              const dist = Math.hypot(currWorldX - coords.x, currWorldY - coords.y);
              if (dist < 20) {
                candidateTarget = { compId: comp.id, pinType: 'input', pinIndex: i, worldX: coords.x, worldY: coords.y };
              }
            }
            // Check output ports
            for (let j = 0; j < comp.outputCount; j++) {
              const coords = this.getPortCoordinates(comp, 'output', j);
              const dist = Math.hypot(currWorldX - coords.x, currWorldY - coords.y);
              if (dist < 20) {
                candidateTarget = { compId: comp.id, pinType: 'output', pinIndex: j, worldX: coords.x, worldY: coords.y };
              }
            }
          });

          if (candidateTarget) {
            // Valid if opposite port type and different component
            const isDifferentComp = (candidateTarget as PortTarget).compId !== this.draftWire.fromCompId;
            const isOppositeType = (candidateTarget as PortTarget).pinType !== this.draftWire.fromPinType;
            isValid = isDifferentComp && isOppositeType;

            if (isValid) {
              this.draftWire.currentWorldX = (candidateTarget as PortTarget).worldX;
              this.draftWire.currentWorldY = (candidateTarget as PortTarget).worldY;
              this.draftWire.targetPort = candidateTarget;
              this.draftWire.isValidTarget = true;
            } else {
              this.draftWire.currentWorldX = currWorldX;
              this.draftWire.currentWorldY = currWorldY;
              this.draftWire.targetPort = candidateTarget;
              this.draftWire.isValidTarget = false;
            }
          } else {
            this.draftWire.currentWorldX = currWorldX;
            this.draftWire.currentWorldY = currWorldY;
            this.draftWire.targetPort = null;
            this.draftWire.isValidTarget = false;
          }

          this.renderCanvas();
          return;
        }

        // Component Drag Movement
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
            this.renderCanvas();
          }
        }
      }
    });

    // Global Mouse Up for Wiring Release & Component Drop
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
          this.stepSimulation();
        }

        this.draftWire = null;
        this.renderCanvas();
      }

      this.draggingCompId = null;
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
      const isInputActive = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
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
        this.selectedCompId = null;
        this.selectedWireId = null;
        this.updateUI();
      }
    });
  }

  /**
   * Deletes a visual component and unhooks all connected simulation nets.
   */
  private deleteComponent(compId: string): void {
    const comp = this.visualComponents.get(compId);
    if (!comp) return;

    // 1. Remove connected wires
    const connectedWires = Array.from(this.visualWires.values()).filter(
      (w) => w.fromCompId === compId || w.toCompId === compId
    );
    connectedWires.forEach((w) => this.deleteWire(w.id));

    // 2. Remove simulation component from engine
    this.circuit.removeComponent(comp.simId);

    // 3. Remove visual component record
    this.visualComponents.delete(compId);

    if (this.selectedCompId === compId) {
      this.selectedCompId = null;
    }

    this.stepSimulation();
  }

  /**
   * Deletes a visual wire and unwires connection in logic-sim-core.
   */
  private deleteWire(wireId: string): void {
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

    this.stepSimulation();
  }

  private startSimulation(): void {
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
    }, 300);
  }

  private pauseSimulation(): void {
    this.isRunning = false;
    if (this.simInterval) clearInterval(this.simInterval);
    
    document.getElementById('btn-run')?.removeAttribute('disabled');
    document.getElementById('btn-pause')?.setAttribute('disabled', 'true');

    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (dot) dot.className = 'dot stopped';
    if (text) text.textContent = 'PAUSED';
  }

  private stepSimulation(): void {
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

  private resetSimulation(): void {
    this.pauseSimulation();
    this.initDemoANDCircuit();
    this.updateUI();
  }

  /**
   * Toggles binary input switch state ('0' <-> '1')
   */
  private toggleInput(visCompId: string): void {
    const comp = this.visualComponents.get(visCompId);
    if (!comp || comp.type !== 'INPUT') return;

    const newVal: LogicValue = comp.val === '1' ? '0' : '1';
    comp.val = newVal;

    // Send updated value to logic-sim-core backend!
    this.circuit.setInput(comp.simId, newVal);
    
    this.stepSimulation();
  }

  /**
   * Computes orthogonal EDA path string between two port points.
   */
  private calculateOrthogonalPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const stub = 20;

    if (x2 >= x1 + stub * 2) {
      const midX = x1 + dx / 2;
      return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
    } else {
      const midX1 = x1 + stub;
      const midX2 = x2 - stub;
      const midY = y1 + (dy >= 0 ? 30 : -30);
      return `M ${x1} ${y1} H ${midX1} V ${midY} H ${midX2} V ${y2} H ${x2}`;
    }
  }

  /**
   * Renders components, connection ports, SVG wires, draft wire, and selection outlines.
   */
  private renderCanvas(): void {
    const viewportEl = document.getElementById('canvas-viewport');
    const nodesLayer = document.getElementById('nodes-layer');
    const wiresLayer = document.getElementById('wires-layer');
    if (!viewportEl || !nodesLayer || !wiresLayer) return;

    viewportEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;

    nodesLayer.innerHTML = '';
    wiresLayer.innerHTML = '';

    // 1. Render Permanent SVG Wires
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
      pathEl.setAttribute('stroke', color);
      pathEl.setAttribute('stroke-width', isSelected ? '4' : netVal === '1' ? '3' : '2');

      if (netVal === '1' && !isSelected) {
        pathEl.setAttribute('filter', 'drop-shadow(0 0 4px #38bdf8)');
      }

      // Wire selection listener
      pathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedWireId = wire.id;
        this.selectedCompId = null;
        this.updateUI();
      });

      wiresLayer.appendChild(pathEl);
    });

    // 2. Render Draft Wire while dragging connection
    if (this.draftWire) {
      const draftPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const { startWorldX, startWorldY, currentWorldX, currentWorldY, fromPinType, targetPort, isValidTarget } = this.draftWire;
      
      let p1X = startWorldX;
      let p1Y = startWorldY;
      let p2X = currentWorldX;
      let p2Y = currentWorldY;

      if (fromPinType === 'input') {
        // Dragging out from an input port -> reverse path orientation
        p1X = currentWorldX;
        p1Y = currentWorldY;
        p2X = startWorldX;
        p2Y = startWorldY;
      }

      draftPath.setAttribute('d', this.calculateOrthogonalPath(p1X, p1Y, p2X, p2Y));
      draftPath.setAttribute('fill', 'none');
      const isInvalid = targetPort !== null && !isValidTarget;
      draftPath.className.baseVal = `draft-wire ${isInvalid ? 'invalid' : ''}`;

      wiresLayer.appendChild(draftPath);
    }

    // 3. Render Component Nodes & Port Dots
    this.visualComponents.forEach((comp) => {
      const nodeEl = document.createElement('div');
      const isSelected = this.selectedCompId === comp.id;
      nodeEl.className = `circuit-node ${comp.type.toLowerCase()}-node ${isSelected ? 'selected' : ''}`;
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
        bodyEl.innerHTML = `
          <button class="toggle-btn val-${comp.val || '0'}">${comp.val || '0'}</button>
          <div class="port-dot ${this.isPortConnected(comp.id, 'output', 0) ? 'connected' : ''}" data-comp-id="${comp.id}" data-pin-type="output" data-pin-index="0" title="Output Port (Drag to wire)"></div>
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

        bodyEl.innerHTML = `
          <div class="port-dot ${this.isPortConnected(comp.id, 'input', 0) ? 'connected' : ''}" data-comp-id="${comp.id}" data-pin-type="input" data-pin-index="0" title="Input Port (Drag to wire)"></div>
          <span class="value-pill val-${probeVal}">${probeVal}</span>
        `;
      } else {
        // Multi-pin Logic Gate
        const inputPinsHtml = Array.from({ length: comp.inputCount })
          .map((_, i) => `
            <div class="pin">
              <span class="port-dot ${this.isPortConnected(comp.id, 'input', i) ? 'connected' : ''}" data-comp-id="${comp.id}" data-pin-type="input" data-pin-index="${i}" title="Input ${i} Port"></span>
              <span>In${i}</span>
            </div>
          `).join('');

        const outputPinsHtml = Array.from({ length: comp.outputCount })
          .map((_, j) => `
            <div class="pin">
              <span>Out${j > 0 ? j : ''}</span>
              <span class="port-dot ${this.isPortConnected(comp.id, 'output', j) ? 'connected' : ''}" data-comp-id="${comp.id}" data-pin-type="output" data-pin-index="${j}" title="Output ${j} Port"></span>
            </div>
          `).join('');

        bodyEl.innerHTML = `
          <div class="node-pins">${inputPinsHtml}</div>
          <div class="node-pins">${outputPinsHtml}</div>
        `;
      }

      // Attach port mousedown listeners for wire creation
      const portDots = bodyEl.querySelectorAll('.port-dot');
      portDots.forEach((dot) => {
        const pinType = dot.getAttribute('data-pin-type') as 'input' | 'output';
        const pinIndex = parseInt(dot.getAttribute('data-pin-index') || '0', 10);

        // Highlight port dot if target of active draft wire
        if (this.draftWire && this.draftWire.targetPort) {
          if (this.draftWire.targetPort.compId === comp.id &&
              this.draftWire.targetPort.pinType === pinType &&
              this.draftWire.targetPort.pinIndex === pinIndex) {
            dot.classList.add(this.draftWire.isValidTarget ? 'target-valid' : 'target-invalid');
          }
        }

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

          this.renderCanvas();
        });
      });

      nodeEl.appendChild(bodyEl);
      nodesLayer.appendChild(nodeEl);
    });
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
  private updateUI(): void {
    const timeEl = document.getElementById('sim-time');
    if (timeEl) timeEl.textContent = this.circuit.time.toString();

    this.renderCanvas();
    this.updateInspector();
    this.updateNetsTable();
    this.updateDiagnostics();
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
            <span class="prop-label">Canvas Dimensions:</span>
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
    if (wireList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color: var(--text-dim); text-align:center;">No wires connected</td></tr>';
      return;
    }

    tbody.innerHTML = wireList.map((wire) => {
      const val = this.circuit.getNetValue(wire.netName);
      const fromComp = this.visualComponents.get(wire.fromCompId);
      const toComp = this.visualComponents.get(wire.toCompId);
      return `
        <tr>
          <td>${wire.netName}</td>
          <td><span class="value-pill val-${val}">${val}</span></td>
          <td>${fromComp?.type || 'Source'}</td>
          <td>${toComp?.type || 'Reader'}</td>
        </tr>
      `;
    }).join('');

    const waveBox = document.getElementById('waveform-preview');
    if (waveBox && wireList.length > 0) {
      const activeNet = wireList[0].netName;
      const history = this.circuit.getHistory(activeNet);
      waveBox.innerHTML = `
        <div style="width: 100%; font-family: var(--font-mono); font-size: 0.75rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
            <span>${activeNet} History:</span>
            <span style="color: var(--accent-cyan);">${history.length} events</span>
          </div>
          <div style="height: 40px; background: var(--bg-main); border-radius: 4px; display: flex; align-items: center; padding: 0 10px; color: var(--accent-emerald);">
            Trace: ${history.map(h => `t=${h.time}:${h.value}`).join(' ➔ ') || 'No transitions yet'}
          </div>
        </div>
      `;
    }
  }

  private updateDiagnostics(): void {
    const floatingNets = this.circuit.findFloatingNets();
    const conflictedNets = this.circuit.findConflictedNets();

    const floatList = document.getElementById('floating-nets-list');
    if (floatList) {
      floatList.innerHTML = floatingNets.length === 0
        ? '<li style="color: var(--text-dim);">None detected ✓</li>'
        : floatingNets.map(n => `<li style="color: var(--accent-amber);">${n}</li>`).join('');
    }

    const conflictList = document.getElementById('conflicted-nets-list');
    if (conflictList) {
      conflictList.innerHTML = conflictedNets.length === 0
        ? '<li style="color: var(--text-dim);">None detected ✓</li>'
        : conflictedNets.map(n => `<li style="color: var(--accent-rose);">${n}</li>`).join('');
    }
  }
}

// Initialize application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new LogicLensUI();
});
