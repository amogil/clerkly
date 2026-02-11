#!/bin/bash

# Скрипт для обновления ссылок на требования ui.X на новые спецификации

# Маппинг ui требований на новые спецификации:
# ui.1-5 → window-management.1-5
# ui.6 → account-profile.1
# ui.7 → error-notifications.1
# ui.8 → navigation.1
# ui.9 → token-management-ui.1
# ui.10 → settings.1
# ui.11 → settings.2
# ui.12 → user-data-isolation.1

echo "Обновление ссылок на требования ui.X..."

# Функция для замены в файлах (macOS compatible)
replace_in_files() {
    local pattern=$1
    local replacement=$2
    
    find src/ tests/ -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s/${pattern}/${replacement}/g" {} +
}

# Window Management (ui.1-5 → window-management.1-5)
echo "Обновление ui.1 → window-management.1..."
replace_in_files "ui\\.1\\.1" "window-management.1.1"
replace_in_files "ui\\.1\\.2" "window-management.1.2"
replace_in_files "ui\\.1\\.3" "window-management.1.3"
replace_in_files "ui\\.1\\.4" "window-management.1.4"
replace_in_files "ui\\.1\\.5" "window-management.1.5"

echo "Обновление ui.2 → window-management.2..."
replace_in_files "ui\\.2\\.1" "window-management.2.1"
replace_in_files "ui\\.2\\.2" "window-management.2.2"
replace_in_files "ui\\.2\\.3" "window-management.2.3"

echo "Обновление ui.3 → window-management.3..."
replace_in_files "ui\\.3\\.1" "window-management.3.1"
replace_in_files "ui\\.3\\.2" "window-management.3.2"
replace_in_files "ui\\.3\\.3" "window-management.3.3"
replace_in_files "ui\\.3\\.4" "window-management.3.4"
replace_in_files "ui\\.3\\.5" "window-management.3.5"

echo "Обновление ui.4 → window-management.4..."
replace_in_files "ui\\.4\\.1" "window-management.4.1"
replace_in_files "ui\\.4\\.2" "window-management.4.2"
replace_in_files "ui\\.4\\.3" "window-management.4.3"
replace_in_files "ui\\.4\\.4" "window-management.4.4"

echo "Обновление ui.5 → window-management.5..."
replace_in_files "ui\\.5\\.1" "window-management.5.1"
replace_in_files "ui\\.5\\.2" "window-management.5.2"
replace_in_files "ui\\.5\\.3" "window-management.5.3"
replace_in_files "ui\\.5\\.4" "window-management.5.4"
replace_in_files "ui\\.5\\.5" "window-management.5.5"
replace_in_files "ui\\.5\\.6" "window-management.5.6"

# Account Profile (ui.6 → account-profile.1)
echo "Обновление ui.6 → account-profile.1..."
replace_in_files "ui\\.6\\.1" "account-profile.1.1"
replace_in_files "ui\\.6\\.2" "account-profile.1.2"
replace_in_files "ui\\.6\\.3" "account-profile.1.3"
replace_in_files "ui\\.6\\.4" "account-profile.1.4"
replace_in_files "ui\\.6\\.5" "account-profile.1.5"
replace_in_files "ui\\.6\\.6" "account-profile.1.6"
replace_in_files "ui\\.6\\.7" "account-profile.1.7"
replace_in_files "ui\\.6\\.8" "account-profile.1.8"

# Error Notifications (ui.7 → error-notifications.1)
echo "Обновление ui.7 → error-notifications.1..."
replace_in_files "ui\\.7\\.1" "error-notifications.1.1"
replace_in_files "ui\\.7\\.2" "error-notifications.1.2"
replace_in_files "ui\\.7\\.3" "error-notifications.1.3"
replace_in_files "ui\\.7\\.4" "error-notifications.1.4"

# Navigation (ui.8 → navigation.1)
echo "Обновление ui.8 → navigation.1..."
replace_in_files "ui\\.8\\.1" "navigation.1.1"
replace_in_files "ui\\.8\\.2" "navigation.1.2"
replace_in_files "ui\\.8\\.3" "navigation.1.3"
replace_in_files "ui\\.8\\.4" "navigation.1.4"
replace_in_files "ui\\.8\\.9" "navigation.1.9"

# Token Management UI (ui.9 → token-management-ui.1)
echo "Обновление ui.9 → token-management-ui.1..."
replace_in_files "ui\\.9\\.1" "token-management-ui.1.1"
replace_in_files "ui\\.9\\.2" "token-management-ui.1.2"
replace_in_files "ui\\.9\\.3" "token-management-ui.1.3"

# Settings - AI Agent (ui.10 → settings.1)
echo "Обновление ui.10 → settings.1..."
replace_in_files "ui\\.10\\.1" "settings.1.1"
replace_in_files "ui\\.10\\.2" "settings.1.2"
replace_in_files "ui\\.10\\.3" "settings.1.3"
replace_in_files "ui\\.10\\.20" "settings.1.20"
replace_in_files "ui\\.10\\.21" "settings.1.21"

# Settings - Date/Time (ui.11 → settings.2)
echo "Обновление ui.11 → settings.2..."
replace_in_files "ui\\.11\\.1" "settings.2.1"
replace_in_files "ui\\.11\\.2" "settings.2.2"
replace_in_files "ui\\.11\\.3" "settings.2.3"

# User Data Isolation (ui.12 → user-data-isolation.1)
echo "Обновление ui.12 → user-data-isolation.1..."
replace_in_files "ui\\.12\\.1" "user-data-isolation.1.1"
replace_in_files "ui\\.12\\.2" "user-data-isolation.1.2"
replace_in_files "ui\\.12\\.3" "user-data-isolation.1.3"

echo "Готово! Все ссылки обновлены."
echo "Проверьте изменения с помощью: git diff src/ tests/"


# Дополнительные подтребования
echo "Обновление дополнительных подтребований..."

# Token Management UI
replace_in_files "ui\\.9\\.4" "token-management-ui.1.4"
replace_in_files "ui\\.9\\.5" "token-management-ui.1.5"
replace_in_files "ui\\.9\\.6" "token-management-ui.1.6"

# Settings - AI Agent
replace_in_files "ui\\.10\\.4" "settings.1.4"
replace_in_files "ui\\.10\\.5" "settings.1.5"
replace_in_files "ui\\.10\\.6" "settings.1.6"
replace_in_files "ui\\.10\\.7" "settings.1.7"
replace_in_files "ui\\.10\\.8" "settings.1.8"
replace_in_files "ui\\.10\\.9" "settings.1.9"
replace_in_files "ui\\.10\\.10" "settings.1.10"
replace_in_files "ui\\.10\\.11" "settings.1.11"
replace_in_files "ui\\.10\\.12" "settings.1.12"

# Settings - Date/Time
replace_in_files "ui\\.11\\.4" "settings.2.4"
replace_in_files "ui\\.11\\.5" "settings.2.5"
replace_in_files "ui\\.11\\.6" "settings.2.6"
replace_in_files "ui\\.11\\.7" "settings.2.7"

# User Data Isolation
replace_in_files "ui\\.12\\.4" "user-data-isolation.1.4"
replace_in_files "ui\\.12\\.5" "user-data-isolation.1.5"
replace_in_files "ui\\.12\\.6" "user-data-isolation.1.6"
replace_in_files "ui\\.12\\.7" "user-data-isolation.1.7"
replace_in_files "ui\\.12\\.8" "user-data-isolation.1.8"
replace_in_files "ui\\.12\\.9" "user-data-isolation.1.9"
replace_in_files "ui\\.12\\.10" "user-data-isolation.1.10"
replace_in_files "ui\\.12\\.11" "user-data-isolation.1.11"
replace_in_files "ui\\.12\\.12" "user-data-isolation.1.12"
replace_in_files "ui\\.12\\.13" "user-data-isolation.1.13"
replace_in_files "ui\\.12\\.14" "user-data-isolation.1.14"
replace_in_files "ui\\.12\\.15" "user-data-isolation.1.15"
replace_in_files "ui\\.12\\.16" "user-data-isolation.1.16"
replace_in_files "ui\\.12\\.17" "user-data-isolation.1.17"
replace_in_files "ui\\.12\\.18" "user-data-isolation.1.18"

echo "Дополнительные подтребования обновлены."
