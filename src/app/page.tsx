export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center max-w-2xl px-6">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Build Your AI
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-sky-300 bg-clip-text text-transparent">
            Workforce
          </span>
        </h1>
        <p className="text-xl text-white/60 mt-4 font-medium">Not Just Another Chatbot.</p>
        <p className="mt-6 text-white/50 text-base max-w-xl mx-auto leading-relaxed">
          Deploy AI teammates that understand your business, generate qualified leads,
          automate repetitive work, execute workflows and help your business grow.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <a href="/auth/signup" className="px-8 py-3.5 rounded-full bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors">
            Start Free Trial
          </a>
          <a href="/auth/login" className="px-8 py-3.5 rounded-full border border-white/20 text-white/70 font-medium text-sm hover:bg-white/5 transition-colors">
            Sign In
          </a>
        </div>
        <p className="mt-10 text-xs text-white/30">No credit card required · 14-day free trial · Cancel anytime</p>
      </div>
    </div>
  );
}
