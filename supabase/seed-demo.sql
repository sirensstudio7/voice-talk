-- VoiceTalk demo seed: admin users + demo businesses
-- Run in Supabase SQL Editor (after setup-all.sql)
-- Sunrise Coffee login: admin@sunrise.coffee / admin123
-- Lorescale hero demo login: admin@lorescale.com / lorescale123

DO $$
DECLARE
  v_sunrise_user_id text;
  v_lorescale_user_id text;
  v_business_id text;
BEGIN
  INSERT INTO users (id, email, password_hash, name)
  VALUES (
    gen_random_uuid()::text,
    'admin@sunrise.coffee',
    '$2b$10$C.Z8JO4GO1yV238IN/6qt.Y9mXF3XsWZQqm5Iak/9zATwnFAWKC3K',
    'Sunrise Admin'
  )
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO users (id, email, password_hash, name)
  VALUES (
    gen_random_uuid()::text,
    'admin@lorescale.com',
    '$2b$10$CdbTPLBsIuBMWOsHZe4OfOeoUhPf67/IJCkB4SRLfLpU14VsT0Mme',
    'Lorescale Admin'
  )
  ON CONFLICT (email) DO NOTHING;

  SELECT id INTO v_sunrise_user_id FROM users WHERE email = 'admin@sunrise.coffee';
  SELECT id INTO v_lorescale_user_id FROM users WHERE email = 'admin@lorescale.com';

  IF NOT EXISTS (SELECT 1 FROM businesses WHERE slug = 'sunrise-coffee') THEN
    INSERT INTO businesses (id, slug, name, tagline, business_type, primary_use_case, onboarding_completed)
    VALUES (
      gen_random_uuid()::text,
      'sunrise-coffee',
      'Sunrise Coffee',
      'Kopi segar, senyum hangat.',
      'cafe',
      'both',
      TRUE
    )
    RETURNING id INTO v_business_id;

    INSERT INTO business_members (id, user_id, business_id, role)
    VALUES (gen_random_uuid()::text, v_sunrise_user_id, v_business_id, 'owner');

    INSERT INTO ai_rules (id, business_id, assistant_name, personality, tone, language, behavioral_rules, tool_instructions)
    VALUES (
      gen_random_uuid()::text,
      v_business_id,
      'Lorescale',
      $personality$Kamu adalah kasir AI yang ramah di Sunrise Coffee.
Bersikaplah hangat, ringkas, dan membantu. Tawarkan tambahan dengan sopan jika relevan.
Konfirmasikan pesanan dengan jelas sebelum menyelesaikan.
Jika pelanggan bertanya tentang jam buka atau kebijakan, gunakan basis pengetahuanmu.
Selalu berbicara dalam Bahasa Indonesia.$personality$,
      'friendly',
      'id',
      $behavioral$Selalu sapa pelanggan dengan hangat.
Tawarkan upsell dengan sopan jika relevan dengan pesanan.
Jika tidak yakin, tanyakan klarifikasi daripada menebak.$behavioral$,
      $tools$Panggil add_to_order segera setelah pelanggan memilih item.
Setelah confirm_order: tanyakan kartu loyalitas atau hal checkout lain dulu, lalu tanyakan nama pelanggan terakhir sebelum pembayaran.
Panggil set_customer_name saat mereka menyebutkan nama.$tools$
    );

    INSERT INTO products (id, business_id, product_id, name, price, category, description, image_url, sort_order)
    VALUES
      (gen_random_uuid()::text, v_business_id, 'latte', 'Latte', 45000, 'Coffee', 'Espresso with steamed milk.', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80', 0),
      (gen_random_uuid()::text, v_business_id, 'cappuccino', 'Cappuccino', 45000, 'Coffee', 'Equal parts espresso, steamed milk, and foam.', 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80', 1),
      (gen_random_uuid()::text, v_business_id, 'americano', 'Americano', 35000, 'Coffee', 'Espresso with hot water.', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80', 2),
      (gen_random_uuid()::text, v_business_id, 'mocha', 'Mocha', 52000, 'Coffee', 'Espresso, chocolate, and steamed milk.', 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=600&q=80', 3),
      (gen_random_uuid()::text, v_business_id, 'cold-brew', 'Cold Brew', 40000, 'Coffee', 'Slow-steeped iced coffee.', 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=80', 4),
      (gen_random_uuid()::text, v_business_id, 'croissant', 'Butter Croissant', 28000, 'Pastry', 'Flaky, buttery classic croissant.', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80', 5),
      (gen_random_uuid()::text, v_business_id, 'muffin', 'Blueberry Muffin', 32000, 'Pastry', 'Baked fresh with wild blueberries.', 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=600&q=80', 6),
      (gen_random_uuid()::text, v_business_id, 'bagel', 'Everything Bagel', 25000, 'Pastry', 'Toasted everything bagel.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80', 7),
      (gen_random_uuid()::text, v_business_id, 'sandwich', 'Egg Sandwich', 65000, 'Food', 'Egg, cheese, and your choice of bread.', 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=600&q=80', 8),
      (gen_random_uuid()::text, v_business_id, 'water', 'Sparkling Water', 18000, 'Drinks', 'Chilled sparkling water.', 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=600&q=80', 9);

    INSERT INTO knowledge_entries (id, business_id, category, title, content, sort_order)
    VALUES
      (gen_random_uuid()::text, v_business_id, 'General', 'Jam buka', 'Kami buka setiap hari pukul 07.00–21.00.', 0),
      (gen_random_uuid()::text, v_business_id, 'General', 'Substitusi susu', 'Susu oat dan almond bisa diganti gratis.', 1),
      (gen_random_uuid()::text, v_business_id, 'General', 'Metode pembayaran', 'Kami menerima tunai dan kartu di kasir.', 2),
      (gen_random_uuid()::text, v_business_id, 'General', 'Pastry segar', 'Semua pastry dipanggang segar setiap pagi.', 3),
      (gen_random_uuid()::text, v_business_id, 'General', 'Kartu loyalitas', 'Tawarkan kartu loyalitas setelah pesanan dikonfirmasi, sebelum menanyakan nama pelanggan.', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM businesses WHERE slug = 'lorescale') THEN
    INSERT INTO businesses (id, slug, name, tagline, business_type, primary_use_case, onboarding_completed)
    VALUES (
      gen_random_uuid()::text,
      'lorescale',
      'Lorescale',
      'Conversation that never sleeps',
      'saas',
      'faqs',
      TRUE
    )
    RETURNING id INTO v_business_id;

    INSERT INTO business_members (id, user_id, business_id, role)
    VALUES (gen_random_uuid()::text, v_lorescale_user_id, v_business_id, 'owner');

    INSERT INTO ai_rules (id, business_id, assistant_name, personality, tone, language, behavioral_rules, tool_instructions)
    VALUES (
      gen_random_uuid()::text,
      v_business_id,
      'Lorescale',
      $lorePersonality$You are Lorescale, the AI assistant on the Lorescale website.
You help visitors understand what Lorescale is, how it works, pricing, features, and how to get started.
Be warm, concise, and helpful. Speak like a knowledgeable product specialist — not a pushy salesperson.
Use the knowledge base to answer questions accurately. If asked about something outside Lorescale, politely redirect.$lorePersonality$,
      'friendly',
      'en',
      $loreBehavioral$Greet visitors warmly when they start a conversation.
Answer product questions clearly using your knowledge base.
If they want to try voice ordering, mention the Sunrise Coffee demo or signing up for their own store.
Keep responses short — one or two sentences unless they ask for detail.$loreBehavioral$,
      $loreTools$This is FAQ mode — do not take orders or process payments.
When the visitor has no more questions or says goodbye, give a brief closing and call end_conversation.$loreTools$
    );

    INSERT INTO knowledge_entries (id, business_id, category, title, content, sort_order)
    VALUES
      (gen_random_uuid()::text, v_business_id, 'Product', 'What is Lorescale?', 'Lorescale is an AI voice conversation platform that turns your business knowledge into natural, always-on customer interactions. Visitors talk to a 3D AI assistant in the browser — for questions, guidance, ordering, booking, and more — powered by the knowledge and rules you configure.', 0),
      (gen_random_uuid()::text, v_business_id, 'Product', 'No app download', 'End users open your Lorescale link in any modern mobile or desktop browser. Push-to-talk works without a native app install.', 1),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Languages', 'English and Indonesian out of the box. Users can switch language during a session and the AI reconnects with the new locale.', 2),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Payment', 'Businesses that accept orders can upload a payment QR code (PayNow, DuitNow, etc.) in the admin dashboard. After an order is confirmed, customers scan the QR and tap "I''ve paid." Payment is optional and depends on your use case.', 3),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Customization', 'Upload a full-screen background image, set the bottom gradient color, and tune your assistant''s appearance so every conversation page matches your brand.', 4),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Getting started', 'Sign in to the Lorescale admin dashboard, add your AI knowledge and rules, choose your use case, then share your /b/your-store link. Try the Sunrise Coffee demo for a voice-ordering example.', 5),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Voice conversations', 'Users hold the mic and speak naturally. Lorescale runs on Gemini Live with low-latency WebSocket sessions for real-time, back-and-forth dialogue.', 6),
      (gen_random_uuid()::text, v_business_id, 'Product', '3D AI avatar', 'A lifelike 3D assistant greets every visitor with talking animations — a premium, human feel for product questions, support, ordering, and more.', 7),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Admin dashboard', 'Manage AI knowledge, rules, conversations, orders, appearance, payment settings, and analytics from one merchant dashboard.', 8),
      (gen_random_uuid()::text, v_business_id, 'Product', 'Industries', 'Lorescale works across industries — coffee shops, restaurants, retail, events, healthcare clinics, salons, and multi-location brands. Each business trains the AI on its own knowledge.', 9),
      (gen_random_uuid()::text, v_business_id, 'Product', 'How it works', '1) Set up your workspace in the admin dashboard with AI knowledge and rules. 2) Share your /b/your-store link. 3) Visitors talk to your AI assistant by voice — for FAQs, orders, bookings, or other flows you enable.', 10);
  END IF;
END $$;
