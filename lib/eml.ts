import "server-only";
import { Prisma } from "./generated/prisma/client";
import { prisma } from "./db";
import { expiresAt } from "./gmail/sync";
import { parseEml, EML_FILE_SIZE_LIMIT } from "./eml-core";
export { parseEml, EML_FILE_SIZE_LIMIT } from "./eml-core";

export async function storeEmlUpload(userId: string, file: File) {
  if (file.size > EML_FILE_SIZE_LIMIT) throw new Error("EML_TOO_LARGE");
  const parsed = await parseEml(
    Buffer.from(await file.arrayBuffer()),
    file.name,
  );
  const duplicate = await prisma.storedEmail.findUnique({
    where: { userId_contentHash: { userId, contentHash: parsed.contentHash } },
    select: { id: true },
  });
  if (duplicate) throw new Error("DUPLICATE_EML");
  return prisma.storedEmail.create({
    data: {
      userId,
      source: "EML_UPLOAD",
      contentHash: parsed.contentHash,
      uploadFileName: file.name.slice(0, 255),
      uploadedAt: new Date(),
      sender: parsed.sender,
      replyTo: parsed.replyTo,
      recipients: parsed.recipients as Prisma.InputJsonValue,
      subject: parsed.subject,
      receivedAt: parsed.receivedAt,
      plainTextBody: parsed.plainTextBody,
      extractedLinks: parsed.extractedLinks as Prisma.InputJsonValue,
      selectedHeaders: parsed.selectedHeaders as Prisma.InputJsonValue,
      contentTruncated: parsed.contentTruncated,
      parseNote: parsed.parseNote,
      processingStatus: "NOT_ANALYZED",
      expiresAt: expiresAt(),
      attachments: { create: parsed.attachments },
    },
  });
}
