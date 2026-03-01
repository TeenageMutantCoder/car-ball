import { decodeEvent, encodeEvent, type InputFrame, type Snapshot } from "@car-ball/protocol";

export interface SnapshotApplier<TRenderSnapshot> {
  applySnapshot: (snapshot: Snapshot) => TRenderSnapshot;
}

export interface InprocessClientNet<TRenderSnapshot> {
  encodeInputFrame: (frame: InputFrame) => string;
  ingestServerPayload: (payload: string) => TRenderSnapshot | null;
}

export function createInprocessClientNet<TRenderSnapshot>(
  snapshotApplier: SnapshotApplier<TRenderSnapshot>,
): InprocessClientNet<TRenderSnapshot> {
  return {
    encodeInputFrame(frame: InputFrame): string {
      return encodeEvent({
        type: "client.input",
        ...frame,
      });
    },

    ingestServerPayload(payload: string): TRenderSnapshot | null {
      const event = decodeEvent(payload);

      if (event.type !== "server.snapshot") {
        return null;
      }

      return snapshotApplier.applySnapshot(event);
    },
  };
}
