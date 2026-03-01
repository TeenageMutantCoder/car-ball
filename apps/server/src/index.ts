import { SimulationCore } from "@car-ball/sim";

export function bootstrapServer(): string {
  const sim = new SimulationCore(["player-1"]);
  const initial = sim.advance(sim.fixedStepMs);
  return `Server initialized at tick: ${initial.tick}`;
}

export * from "./room.ts";
export * from "./runtime.ts";
