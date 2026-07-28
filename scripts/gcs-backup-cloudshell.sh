#!/bin/bash
# kibritci-erp Firestore yedek bucket — Google Cloud Shell'de calistirin.
# Firebase Console > sag ust > Cloud Shell ikonu (>_) > yapistirip Enter.
#
# Tek komut:
#   bash <(curl -sL ...)  — veya dosyayi Cloud Shell'e yukleyip: bash gcs-backup-cloudshell.sh

set -e

PROJECT="kibritci-erp"
BUCKET="kibritci-erp-backups"
REGION="europe-west3"

echo "=== Proje: $PROJECT ==="
gcloud config set project "$PROJECT"

echo "=== Bucket olusturuluyor (Nearline, $REGION) ==="
if gsutil ls -b "gs://${BUCKET}" 2>/dev/null; then
  echo "Bucket zaten var: gs://${BUCKET}"
else
  gsutil mb -p "$PROJECT" -c NEARLINE -l "$REGION" "gs://${BUCKET}"
  echo "Bucket olusturuldu."
fi

echo "=== Versiyonlama aciliyor ==="
gsutil versioning set on "gs://${BUCKET}"

echo "=== Firestore export izinleri ==="
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com"
echo "Firestore SA: $SA"
gsutil iam ch "serviceAccount:${SA}:roles/storage.admin" "gs://${BUCKET}"

echo "=== Ilk yedek (manuel test) ==="
gcloud firestore export "gs://${BUCKET}/daily/$(date +%Y-%m-%d)" --project="$PROJECT"

echo ""
echo "=== TAMAMLANDI ==="
echo "Bucket: gs://${BUCKET}"
echo "Ilk export: gs://${BUCKET}/daily/$(date +%Y-%m-%d)"
echo ""
echo "Sonraki adim: Firestore Console > Backups > Schedule daily export"
echo "  veya Cloud Scheduler ile her gece 03:00 tekrarla."
