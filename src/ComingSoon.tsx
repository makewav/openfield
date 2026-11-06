/**
 * Shown in an app that the port has not reached yet.
 *
 * Those apps were built on local models that the provider does not expose:
 * Effects is a set of LTX LoRAs, Mirror needs pose/depth tracking, Reshoot warps
 * a camera through geometry, Stage renders a 3D blocking, and Object is
 * TRELLIS.2 image to 3D. Their screens are kept so the studio still looks like
 * itself, but nothing here can render until a provider route exists.
 */
export function ComingSoon({ app, detail }: { app: string; detail?: string }) {
  return (
    <div className="coming-soon" role="note">
      <div className="coming-soon-title">{app} is not on this build yet</div>
      <p>
        These controls are here so the app keeps its shape, but Generate is off: this app
        needs a model route the provider does not offer.
      </p>
      {detail && <p className="dim">{detail}</p>}
    </div>
  );
}

/** A disabled stand-in for the Generate button. */
export function SoonButton({ label = 'Generate' }: { label?: string }) {
  return (
    <button type="button" className="gen-tile" disabled title="Not available on this build">
      <span>{label}</span>
      <small>Not on this build</small>
    </button>
  );
}
