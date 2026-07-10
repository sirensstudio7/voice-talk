-- VoiceTalk demo seed: admin user + Sunrise Coffee business
-- Run in Supabase SQL Editor (after setup-all.sql)
-- Login: admin@sunrise.coffee / admin123

DO $$
DECLARE
  v_user_id text;
  v_business_id text;
BEGIN
  INSERT INTO users (id, email, password_hash, name)
  VALUES (
    gen_random_uuid()::text,
    'admin@sunrise.coffee',
    '$2b$10$C.Z8JO4GO1yV238IN/6qt.Y9mXF3XsWZQqm5Iak/9zATwnFAWKC3K',
    'Admin'
  )
  ON CONFLICT (email) DO NOTHING;

  SELECT id INTO v_user_id FROM users WHERE email = 'admin@sunrise.coffee';

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
    VALUES (gen_random_uuid()::text, v_user_id, v_business_id, 'owner');

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
Setelah confirm_order, tanyakan nama pelanggan sebelum pembayaran.
Gunakan set_customer_name saat mereka menjawab.$tools$
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

    INSERT INTO knowledge_entries (id, business_id, category, content, sort_order)
    VALUES
      (gen_random_uuid()::text, v_business_id, 'General', 'Kami buka setiap hari pukul 07.00–21.00.', 0),
      (gen_random_uuid()::text, v_business_id, 'General', 'Susu oat dan almond bisa diganti gratis.', 1),
      (gen_random_uuid()::text, v_business_id, 'General', 'Kami menerima tunai dan kartu di kasir.', 2),
      (gen_random_uuid()::text, v_business_id, 'General', 'Semua pastry dipanggang segar setiap pagi.', 3),
      (gen_random_uuid()::text, v_business_id, 'General', 'Tawarkan kartu loyalitas setelah pesanan dikonfirmasi.', 4);
  END IF;
END $$;
