export function AboutUsSection() {
  return (
    <section id="about" className="relative bg-white">
      <div className="landing-container border-x border-dashed border-black/[0.06]">
        <div className="relative w-full py-16 md:px-8 lg:px-16 lg:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex justify-center">
              <div className="rounded-full bg-[#f1efec] px-4 py-1 text-xs font-medium uppercase tracking-wider text-black">
                About Us
              </div>
            </div>

            <div className="relative mx-auto max-w-screen-xl text-center text-neutral-900">
              <p className="mx-auto max-w-3xl text-lg font-bold leading-relaxed md:text-xl lg:text-2xl">
                Lorescale helps businesses deliver smarter customer experiences with
                AI-powered voice and chat. Our platform provides instant, natural
                conversations that answer questions, guide customers, and automate routine
                interactions—24/7. Easy to deploy and simple to manage, Lorescale enables
                organizations to improve service, reduce repetitive work, and stay available
                whenever customers need them.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
