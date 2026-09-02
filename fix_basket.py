with open("apps/customer-app/src/features/commerce/BasketDrawer.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'const { order, checkoutPhase, checkoutOpenRequest, openCheckoutPanel } = useVoiceStore();',
    'const { order, checkoutPhase, checkoutOpenRequest } = useCommerceStore();\n  const openCheckoutPanel = useUiStore((s) => s.openCheckoutPanel);'
)

with open("apps/customer-app/src/features/commerce/BasketDrawer.tsx", "w") as f:
    f.write(content)
