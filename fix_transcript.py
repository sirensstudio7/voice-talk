with open("apps/customer-app/src/features/voice/TranscriptFeed.tsx", "r") as f:
    content = f.read()

content = content.replace("""  const {
    transcript,
    language,
    avatarUrl,
    avatarCacheBust,
    orderingEnabled,
    bookingEnabled,
    faqMode,
    menuCache,
    menuCacheSlug,
  } = useVoiceStore();""",
"""  const { transcript, language, avatarUrl, avatarCacheBust } = useVoiceStore();
  const { orderingEnabled, bookingEnabled, faqMode, menuCache, menuCacheSlug } = useCommerceStore();""")

with open("apps/customer-app/src/features/voice/TranscriptFeed.tsx", "w") as f:
    f.write(content)
