#!/bin/bash
# scripts/deploy-cloudrun.sh
# Deployment script for Google Cloud Run

set -e

# Configuration
PROJECT_ID="your-google-cloud-project-id" # Replace with your project ID
REGION="us-central1"                      # Default region
SERVICE_NAME="edusync-ai"
IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "Deploying ${SERVICE_NAME} to Google Cloud Run in project ${PROJECT_ID}..."

# 1. Ensure gcloud is authenticated and project is set (uncomment if needed)
# gcloud auth login
# gcloud config set project $PROJECT_ID

# 2. Build and submit the Docker image to Google Container Registry
echo "Building and uploading Docker image to GCR..."
gcloud builds submit --tag $IMAGE_TAG

# 3. Deploy the image to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_TAG \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 0 \
  --max-instances 10 \
  --cpu 1 \
  --memory 1Gi \
  --set-env-vars="NODE_ENV=production,GEMINI_PROJECT_ID=replace-with-your-google-cloud-project-id,GEMINI_LOCATION=us-central1,NEXT_PUBLIC_SUPABASE_URL=replace-in-console,SUPABASE_SERVICE_ROLE_KEY=replace-in-console,TAVILY_API_KEY=replace-in-console"

echo "Deployment complete! Don't forget to update your environment variables in the Cloud Run console."
