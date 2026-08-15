export default function Home() {
  return (
    <div className="flex items-center justify-center w-full h-screen bg-black text-white text-center px-4">
      <div>
        <h1 className="text-2xl font-bold mb-2">VidSrc Embed Player</h1>
        <p className="text-gray-400 text-sm mb-4">Use the embed URLs below:</p>
        <div className="text-left bg-white/5 rounded-lg p-4 text-sm text-gray-300 space-y-2 font-mono">
          <p><span className="text-[#e50914]">Movie:</span> /embed/movie/&#123;tmdb_id&#125;</p>
          <p><span className="text-blue-400">TV:</span> /embed/tv/&#123;tmdb_id&#125;/&#123;season&#125;/&#123;episode&#125;</p>
        </div>
        <div className="mt-4 text-gray-500 text-xs space-y-1">
          <p>Example: /embed/movie/550</p>
          <p>Example: /embed/tv/1396/1/1</p>
        </div>
      </div>
    </div>
  );
}
