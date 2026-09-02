import os
import re

MAPPINGS = {
    "voice-controls.tsx": "features/voice/VoiceActionBar.tsx",
    "transcript-panel.tsx": "features/voice/TranscriptFeed.tsx",
    "store-menu-panel.tsx": "features/commerce/MenuDrawer.tsx",
    "basket-panel.tsx": "features/commerce/BasketDrawer.tsx",
    "payment-step.tsx": "features/commerce/PaymentModal.tsx",
    "order-complete-step.tsx": "features/commerce/OrderComplete.tsx",
    "appointment-booking-panel.tsx": "features/booking/AppointmentDrawer.tsx",
    "slide-over.tsx": "components/SlideOver.tsx",
    "fly-to-basket.tsx": "features/commerce/FlyToBasket.tsx",
    "photo/smart-photo-moment-overlay.tsx": "features/photo/PhotoMomentOverlay.tsx",
}

for legacy_file, new_path in MAPPINGS.items():
    full_legacy = f"apps-legacy/customer-app/src/components/{legacy_file}"
    full_new = f"apps/customer-app/src/{new_path}"
    
    with open(full_legacy, "r") as f:
        content = f.read()

    # Replacements
    content = content.replace('import { useSessionStore } from "@/store/session-store";', 
                              'import { useVoiceStore } from "@/store/voice-store";\nimport { useCommerceStore } from "@/store/commerce-store";\nimport { useUiStore } from "@/store/ui-store";')
    content = content.replace('import { useKioskStore } from "@/store/kiosk-store";', '')
    content = content.replace('useKioskStore(', 'useVoiceStore(')
    content = content.replace('useSessionStore()', 'useVoiceStore()') # This might be hacky but we'll see
    # wait, instead of renaming destructuring, just keep it, but wait, useVoiceStore doesn't return order!
    
    # Let's fix destructurings by replacing `useSessionStore` with a proxy object or just patching the code.
    # A better way is just to replace useSessionStore calls with a custom hook that combines them.
    # But wait, components should use the new stores directly.
    # The instructions say:
    # "Replace useSessionStore selectors with the appropriate new store: ..."
    
    os.makedirs(os.path.dirname(full_new), exist_ok=True)
    with open(full_new, "w") as f:
        f.write(content)

print("Done copying basic files.")
