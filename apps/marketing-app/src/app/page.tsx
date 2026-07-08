import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { FeaturesGrid } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PricingSection } from "@/components/landing/pricing";
import { IndustrySection } from "@/components/landing/industry";
import { FAQSection } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";

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
        <IndustrySection />
        <FAQSection />
      </main>
      <Footer />
    </>
  );
}
