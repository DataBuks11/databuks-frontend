export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">DataBuks</h1>
        <p className="mt-2 text-white/50">Build Your AI Workforce</p>
        <a href="/auth/login" className="mt-4 inline-block px-6 py-3 bg-blue-500 rounded-full text-white">Login</a>
      </div>
    </div>
  );
}
