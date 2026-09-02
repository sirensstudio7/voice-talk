with open("apps/customer-app/src/features/voice/VoiceActionBar.tsx", "r") as f:
    content = f.read()

# Replace BottomControls with VoiceActionBar and useVoiceSession
content = content.replace("export function BottomControls({", "export function VoiceActionBar({")

# We will just write a simpler VoiceActionBar.tsx
