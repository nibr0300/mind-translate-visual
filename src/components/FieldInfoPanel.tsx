import { motion, AnimatePresence } from "framer-motion";

interface FieldInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FieldInfoPanel({ isOpen, onClose }: FieldInfoPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          className="absolute right-0 top-0 bottom-0 w-96 bg-card/98 backdrop-blur-md border-l border-border z-40 overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-mono text-sm font-semibold tracking-wider uppercase text-primary">
                How It Works
              </h2>
              <button
                onClick={onClose}
                className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6 text-sm text-secondary-foreground leading-relaxed">
              <section>
                <h3 className="font-mono text-xs font-semibold text-field-fy tracking-wider uppercase mb-2">
                  The Geometric Field
                </h3>
                <p className="text-muted-foreground">
                  Instead of forcing linear reading order, documents are converted into a{" "}
                  <span className="text-foreground">permutation-invariant geometric field</span> where
                  information exists as clusters in high-dimensional space. Semantic meaning and spatial
                  layout are preserved as distance and resonance.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-xs font-semibold text-field-fz tracking-wider uppercase mb-2">
                  FZ — Epistemic Tension
                </h3>
                <p className="text-muted-foreground">
                  FZ measures <span className="text-field-fz">density gradient</span> — the boundary
                  signal between clusters. High FZ units sit at the edges of understanding, where
                  concepts collide and new meaning emerges. In therapy: where breakthroughs happen. In
                  didactics: where misconceptions cluster.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-xs font-semibold text-field-fy tracking-wider uppercase mb-2">
                  FY — Resonance
                </h3>
                <p className="text-muted-foreground">
                  FY measures <span className="text-field-fy">alignment with cluster center</span> —
                  how strongly a unit belongs to its eigenstate. High FY = core concept. Low FY = liminal
                  space between categories.
                </p>
              </section>

              <section>
                <h3 className="font-mono text-xs font-semibold text-primary tracking-wider uppercase mb-2">
                  Use Cases
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li>
                    <span className="text-foreground font-medium">Psychiatry & Therapy:</span> Map
                    emotional patterns in journals. FZ spikes reveal subconscious triggers. Clusters
                    become therapeutic actors.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Didactics:</span> Visualize knowledge
                    structure. Identify misconception zones. Track comprehension topology.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">AI Translation:</span> Convert
                    documents to geometric prompts for stateless AI. Clusters act as persistent
                    short-term memory anchors.
                  </li>
                </ul>
              </section>

              <section className="border-t border-border pt-4">
                <h3 className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
                  Architecture
                </h3>
                <div className="font-mono text-[11px] text-muted-foreground space-y-1">
                  <p>1. PDF → text + bbox extraction</p>
                  <p>2. Sentence embedding → ℝ<sup>1536</sup></p>
                  <p>3. Spatial modulation (wave propagation)</p>
                  <p>4. Local k-NN field dynamics</p>
                  <p>5. HDBSCAN → eigenstates</p>
                  <p>6. FZ/FY computation + UMAP projection</p>
                  <p>7. Export → GeometricField.json</p>
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
