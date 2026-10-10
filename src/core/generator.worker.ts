import { generateDisks } from "./geometry";
self.onmessage = (e) => {
  try {
    const disks = generateDisks(e.data.geometry, (n) =>
      self.postMessage({ type: "progress", n }),
    );
    self.postMessage({ type: "complete", disks });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Génération impossible.",
    });
  }
};
