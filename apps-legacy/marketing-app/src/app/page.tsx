import { Navbar } from "@/components/landing/navbar";
import { AboutUsSection } from "@/components/landing/about-us";
import { HeroSection } from "@/components/landing/hero";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { FeaturesGrid } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { IndustrySection } from "@/components/landing/industry";
import { FAQSection } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { PreFooterCta } from "@/components/landing/pre-footer-cta";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <AboutUsSection />
        <ProductShowcase />
        <FeaturesGrid />
        <HowItWorks />
        <IndustrySection />
        <FAQSection />
      </main>
      <PreFooterCta />
      <Footer />
    </>
  );
}
