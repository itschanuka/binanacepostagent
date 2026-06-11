import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createServiceRoleClient } from "@/lib/supabase/server";

const IMAGE_BUCKET = "post-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extensionForType(type: string) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return apiError("Image file is required", 400);
  }

  if (!allowedTypes.has(file.type)) {
    return apiError("Only JPG, PNG, WebP, and GIF images are allowed", 400);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return apiError("Image must be 5MB or smaller", 400);
  }

  const supabase = createServiceRoleClient();
  const filePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extensionForType(file.type)}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return apiError(error.message);
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filePath);

  return NextResponse.json({
    ok: true,
    imageUrl: data.publicUrl,
    path: filePath,
  });
}
