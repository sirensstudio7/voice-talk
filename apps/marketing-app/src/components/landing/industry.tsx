import Image from "next/image";

const INDUSTRIES = [
  {
    name: "Cafés & coffee",
    description:
      "Take voice orders for lattes, pastries, and daily specials without adding counter staff during rush hour.",
    image:
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Retail",
    description:
      "Help shoppers find products, check stock, and complete purchases through natural voice conversations in-store or online.",
    image:
      "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Healthcare",
    description:
      "Patient scheduling, appointment reminders, and care coordination with clear voice guidance and secure handoffs.",
    image:
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "E-commerce",
    description:
      "Handle order tracking, returns, and product questions at scale — especially during peak shopping seasons.",
    image:
      "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Education",
    description:
      "Student enrollment support, course recommendations, and campus info through voice on any device.",
    image:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Finance",
    description:
      "Account inquiries, payment status, and guided onboarding with voice flows that reduce call center load.",
    image:
      "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=800&auto=format&fit=crop&q=80",
  },
] as const;

function IndustryCard({
  name,
  description,
  image,
}: {
  name: string;
  description: string;
  image: string;
}) {
  return (
    <article className="flex h-full flex-col bg-white">
      <div className="relative h-52 shrink-0 border-b border-[#f0f0f0] sm:h-60">
        <Image src={image} alt="" fill className="object-cover" sizes="(min-width: 1024px) 33vw, 50vw" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-6">
        <h3 className="text-lg font-medium text-[#181818]">{name}</h3>
        <p className="text-sm leading-relaxed text-[#46484d]">{description}</p>
      </div>
    </article>
  );
}

export function IndustrySection() {
  return (
    <section id="industry" className="bg-white">
      <div className="landing-container border-x border-b border-dashed border-black/[0.06]">
        <div className="px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mb-14 max-w-3xl">
            <div className="mb-6 text-sm uppercase tracking-wide text-[#737373]">Industry</div>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-tight text-[#181818]">
              Solutions Across Every Sector
            </h2>
          </div>

          <div className="border border-[#f0f0f0]">
            <div className="grid grid-cols-1 gap-px bg-[#f0f0f0] sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry) => (
                <IndustryCard key={industry.name} {...industry} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
