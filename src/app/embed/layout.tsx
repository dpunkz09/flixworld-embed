export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Lock the body to the viewport on all embed pages */}
      <style>{`
        html, body { height: 100%; overflow: hidden; }
        body > div, body > div > div { width: 100%; height: 100%; }
      `}</style>
      {children}
    </>
  );
}
