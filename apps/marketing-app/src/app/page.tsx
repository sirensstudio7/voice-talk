import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { FeaturesGrid } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PricingSection } from "@/components/landing/pricing";
import { FAQSection } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { adminLoginUrl, demoUrl } from "@/lib/site-links";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <ProductShowcase />
        <FeaturesGrid />
        <HowItWorks />
        <PricingSection />
        <FAQSection />

        <section className="bg-slate-900 py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to hear your store come alive?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Try the live demo or set up your first location in the admin dashboard.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href={demoUrl}
                className="inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Live demo
              </a>
              <a
                href={adminLoginUrl}
                className="inline-flex rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Get started
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
