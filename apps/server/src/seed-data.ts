export const BUSINESS_NAME = "Sunrise Coffee";
export const BUSINESS_TAGLINE = "Kopi segar, senyum hangat.";

export const PERSONALITY = `Kamu adalah kasir AI yang ramah di Sunrise Coffee.
Bersikaplah hangat, ringkas, dan membantu. Tawarkan tambahan dengan sopan jika relevan.
Konfirmasikan pesanan dengan jelas sebelum menyelesaikan.
Jika pelanggan bertanya tentang jam buka atau kebijakan, gunakan basis pengetahuanmu.
Selalu berbicara dalam Bahasa Indonesia.`;

export const BEHAVIORAL_RULES = `Selalu sapa pelanggan dengan hangat.
Tawarkan upsell dengan sopan jika relevan dengan pesanan.
Jika tidak yakin, tanyakan klarifikasi daripada menebak.`;

export const TOOL_INSTRUCTIONS = `Panggil add_to_order segera setelah pelanggan memilih item.
Setelah item masuk, sebut nama, harga, dan total keranjang (contoh: "Latte Rp 45.000. Total Rp 45.000."). Jangan sebut item tanpa harganya.
Setelah confirm_order: tanyakan kartu loyalitas atau hal checkout lain dulu (satu topik per turn). Jika Smart Photo Moment aktif, tanyakan foto kenang-kenangan di turn terpisah sebelum nama, lalu panggil set_photo_souvenir_consent.
Lalu tanyakan nama pelanggan terakhir di turn terpisah.
Pertanyaan nama harus satu-satunya pertanyaan di turn itu — jangan gabungkan dengan foto, loyalitas, atau pertanyaan lain. Jangan ulangi pertanyaan yang sudah dijawab.
Di turn yang sama, panggil prompt_payment setelah pertanyaan nama standalone.
Tunggu pelanggan menjawab, lalu panggil set_customer_name — layar pembayaran terbuka otomatis setelah nama disimpan.`;

export const KNOWLEDGE = [
  { title: "Jam buka", content: "Kami buka setiap hari pukul 07.00–21.00." },
  { title: "Substitusi susu", content: "Susu oat dan almond bisa diganti gratis." },
  { title: "Metode pembayaran", content: "Kami menerima tunai dan kartu di kasir." },
  { title: "Pastry segar", content: "Semua pastry dipanggang segar setiap pagi." },
  {
    title: "Kartu loyalitas",
    content:
      "Tawarkan kartu loyalitas setelah pesanan dikonfirmasi, sebelum foto kenang-kenangan (jika Smart Photo Moment aktif) dan sebelum menanyakan nama pelanggan. Tanyakan kartu loyalitas di turn terpisah — jangan gabungkan dengan foto atau pertanyaan nama.",
  },
];

export const PRODUCTS = [
  {
    id: "latte",
    name: "Latte",
    price: 45000,
    category: "Coffee",
    description: "Espresso with steamed milk.",
    image_url:
      "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "cappuccino",
    name: "Cappuccino",
    price: 45000,
    category: "Coffee",
    description: "Equal parts espresso, steamed milk, and foam.",
    image_url:
      "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "americano",
    name: "Americano",
    price: 35000,
    category: "Coffee",
    description: "Espresso with hot water.",
    image_url:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "mocha",
    name: "Mocha",
    price: 52000,
    category: "Coffee",
    description: "Espresso, chocolate, and steamed milk.",
    image_url:
      "https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "cold-brew",
    name: "Cold Brew",
    price: 40000,
    category: "Coffee",
    description: "Slow-steeped iced coffee.",
    image_url:
      "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "croissant",
    name: "Butter Croissant",
    price: 28000,
    category: "Pastry",
    description: "Flaky, buttery classic croissant.",
    image_url:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "muffin",
    name: "Blueberry Muffin",
    price: 32000,
    category: "Pastry",
    description: "Baked fresh with wild blueberries.",
    image_url:
      "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "bagel",
    name: "Everything Bagel",
    price: 25000,
    category: "Pastry",
    description: "Toasted everything bagel.",
    image_url:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "sandwich",
    name: "Egg Sandwich",
    price: 65000,
    category: "Food",
    description: "Egg, cheese, and your choice of bread.",
    image_url:
      "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "water",
    name: "Sparkling Water",
    price: 18000,
    category: "Drinks",
    description: "Chilled sparkling water.",
    image_url:
      "https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=600&q=80",
  },
];
