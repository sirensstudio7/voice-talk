import os
import re
import shutil

LEGACY_SRC = "apps-legacy/super-admin-app/src"
NEW_SRC = "apps/super-admin-app/src"

ROUTES = [
    "app/login/page.tsx",
    "app/(dashboard)/page.tsx",
    "app/(dashboard)/users/page.tsx",
    "app/(dashboard)/users/[id]/page.tsx",
    "app/(dashboard)/businesses/page.tsx",
    "app/(dashboard)/businesses/[id]/page.tsx",
    "app/(dashboard)/subscriptions/page.tsx",
    "app/(dashboard)/avatar-pose/page.tsx",
    "app/(dashboard)/avatar-pose/clips/[id]/page.tsx",
    "app/(dashboard)/audit-logs/page.tsx",
    "app/(dashboard)/settings/page.tsx",
]

COMPONENTS_TO_COPY = {
    "components/users-table.tsx": "components/UsersTable.tsx",
    "components/status-badge.tsx": "components/StatusBadge.tsx",
    "components/ui-blocks.tsx": "components/UiBlocks.tsx",
    "components/slide-over.tsx": "components/SlideOver.tsx",
    "components/avatar-pose-adjust-panel.tsx": "components/avatar-pose/AvatarPoseAdjustPanel.tsx",
    "components/avatar-pose-timeline.tsx": "components/avatar-pose/AvatarPoseTimeline.tsx"
}

def fix_imports(content):
    # Replace @/components/ui/xxx with @voicetalk/ui
    content = re.sub(r'from\s+"@/components/ui/[^"]+"', 'from "@voicetalk/ui"', content)
    # Fix local component imports
    content = content.replace('@/components/users-table', '@/components/UsersTable')
    content = content.replace('@/components/status-badge', '@/components/StatusBadge')
    content = content.replace('@/components/ui-blocks', '@/components/UiBlocks')
    content = content.replace('@/components/slide-over', '@/components/SlideOver')
    content = content.replace('@/components/avatar-pose-adjust-panel', '@/components/avatar-pose/AvatarPoseAdjustPanel')
    content = content.replace('@/components/avatar-pose-timeline', '@/components/avatar-pose/AvatarPoseTimeline')
    return content

for route in ROUTES:
    legacy_path = os.path.join(LEGACY_SRC, route)
    new_path = os.path.join(NEW_SRC, route)
    
    if os.path.exists(legacy_path):
        os.makedirs(os.path.dirname(new_path), exist_ok=True)
        with open(legacy_path, 'r') as f:
            content = f.read()
        
        content = fix_imports(content)
        
        with open(new_path, 'w') as f:
            f.write(content)
        print(f"Migrated route: {route}")

for old_comp, new_comp in COMPONENTS_TO_COPY.items():
    legacy_path = os.path.join(LEGACY_SRC, old_comp)
    new_path = os.path.join(NEW_SRC, new_comp)
    
    if os.path.exists(legacy_path):
        os.makedirs(os.path.dirname(new_path), exist_ok=True)
        with open(legacy_path, 'r') as f:
            content = f.read()
        
        content = fix_imports(content)
        
        with open(new_path, 'w') as f:
            f.write(content)
        print(f"Migrated component: {new_comp}")

