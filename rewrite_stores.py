import os
import glob
import re

UI_KEYS = ["menuPanelOpen", "checkoutPanelOpen", "bookingPanelOpen", "selectedTreatment", "setMenuPanelOpen", "setCheckoutPanelOpen", "setBookingPanelOpen", "openMenuPanel", "closeMenuPanel", "openCheckoutPanel", "closeCheckoutPanel", "openBookingPanel", "closeBookingPanel"]
COMMERCE_KEYS = ["order", "checkoutPhase", "checkoutOpenRequest", "flyAnimations", "addItemToOrder", "startNewOrder", "reset", "setPhotoSouvenirConsent", "decrementItemFromOrder", "removeItemFromOrder", "setItemNote", "enqueueFlyAnimation", "completeFlyAnimation", "setMenuProductMeta", "setMenuCache", "refreshMenuCache", "menuProductMeta", "menuCache", "menuCacheSlug", "orderingEnabled", "menuEnabled", "bookingEnabled", "faqMode", "paymentCompleteRequest", "pendingCheckoutReveal", "pendingNamePaymentReveal", "photoSouvenirConsent", "markPaid", "expirePayment"]

files = glob.glob("apps/customer-app/src/features/**/*.tsx", recursive=True) + glob.glob("apps/customer-app/src/components/**/*.tsx", recursive=True)

for file in files:
    with open(file, "r") as f:
        content = f.read()

    # If it has useSessionStore destructured:
    # const { a, b } = useSessionStore();
    # This is hard. We can just change all useSessionStore(s => s.KEY) to the right store.
    for key in UI_KEYS:
        content = re.sub(rf'useSessionStore\(\s*\(\s*[a-zA-Z_]\s*\)\s*=>\s*[a-zA-Z_]\.{key}\s*\)', f'useUiStore((s) => s.{key})', content)
    for key in COMMERCE_KEYS:
        content = re.sub(rf'useSessionStore\(\s*\(\s*[a-zA-Z_]\s*\)\s*=>\s*[a-zA-Z_]\.{key}\s*\)', f'useCommerceStore((s) => s.{key})', content)
        
    # Also replace any remaining useSessionStore with useVoiceStore
    content = content.replace('useSessionStore', 'useVoiceStore')

    with open(file, "w") as f:
        f.write(content)

print("Stores rewritten")
