export function AuthLayout({ children, title, loginStyle = false }: Readonly<{ children: React.ReactNode; title: string; loginStyle?: boolean }>) {
  return (
    <main className={`flex min-h-screen flex-col items-center px-5 ${loginStyle ? "w-screen" : ""}`}>
      <section
        className={`w-full ${loginStyle ? "my-auto min-w-0 max-w-[550px]" : "mt-[11vh] max-w-[360px]"}`}
        style={loginStyle ? { width: "min(550px, calc(100vw - 2.5rem))" } : undefined}
      >
        <h1 className={`font-semibold tracking-tight text-[#18232b] ${loginStyle ? "mb-[53px] text-gms-title" : "mb-5 text-gms-title"}`}>{title}</h1>
        {children}
      </section>
      {!loginStyle && <footer className="mt-auto mb-7 w-full max-w-[1280px] border-t border-[#e3e8eb] pt-4 text-center text-gms-label text-[#93a0a8]">Gemstone Management System</footer>}
    </main>
  );
}
