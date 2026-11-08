
import { jsPDF } from "jspdf";
import { supabase } from "./supabase";

const BUCKET_NAME = "appointment-references";

export async function createAppointmentPdf(
  reference: string,
  userId: string
): Promise<string> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Check your .env file."
    );
  }

  if (!reference.trim()) {
    throw new Error(
      "Appointment reference number is missing."
    );
  }

  if (!userId.trim()) {
    throw new Error(
      "Patient user ID is missing."
    );
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error(
      "Your session has expired. Please log in again."
    );
  }

  if (authData.user.id !== userId) {
    throw new Error(
      "Unauthorized: You cannot generate another patient's PDF."
    );
  }

  const referencePattern =
    /^CDC-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  if (!referencePattern.test(reference)) {
    throw new Error(
      "Invalid appointment reference number."
    );
  }

  const { data: appointment, error: appointmentError } =
    await supabase
      .from("dental_appointments")
      .select("id,reference,patient_id")
      .eq("reference", reference)
      .eq("patient_id", userId)
      .maybeSingle();

  if (appointmentError) {
    throw new Error(
      "Unable to verify appointment: " +
        appointmentError.message
    );
  }

  if (!appointment) {
    throw new Error(
      "Appointment was not found in your account."
    );
  }

  const filePath = `${userId}/${reference}.pdf`;

  const storage = supabase.storage.from(BUCKET_NAME);

  console.log("Appointment Reference:", reference);
  console.log("Storage Path:", filePath);

  const {
    data: existingFile,
    error: existingError,
  } = await storage.download(filePath);

  if (!existingError && existingFile) {
    if (existingFile.size === 0) {
      throw new Error(
        "The existing PDF is empty."
      );
    }

    const { data: existingUrl } =
      storage.getPublicUrl(filePath);

    console.log(
      "Existing appointment PDF found:",
      existingUrl.publicUrl
    );

    return existingUrl.publicUrl;
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth =
    pdf.internal.pageSize.getWidth();

  const center = pageWidth / 2;

  pdf.setFillColor(8, 127, 156);
  pdf.rect(0, 0, pageWidth, 48, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(21);
  pdf.setTextColor(255, 255, 255);

  pdf.text(
    "CEMPRON DENTAL CLINIC",
    center,
    28,
    { align: "center" }
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(25, 55, 74);

  pdf.text(
    "APPOINTMENT REFERENCE",
    center,
    68,
    { align: "center" }
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(110, 125, 140);

  pdf.text(
    "Your unique dental appointment reference number",
    center,
    78,
    { align: "center" }
  );

  pdf.setFillColor(238, 249, 251);
  pdf.setDrawColor(210, 232, 239);

  pdf.roundedRect(
    15,
    94,
    pageWidth - 30,
    38,
    4,
    4,
    "FD"
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(8, 127, 156);

  pdf.text(
    reference,
    center,
    116,
    {
      align: "center",
      maxWidth: pageWidth - 40,
    }
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(65, 85, 100);

  pdf.text(
    "Please present this appointment reference",
    center,
    152,
    { align: "center" }
  );

  pdf.text(
    "to the dental clinic for verification.",
    center,
    160,
    { align: "center" }
  );

  pdf.setDrawColor(215, 230, 235);

  pdf.line(
    25,
    178,
    pageWidth - 25,
    178
  );
  
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(145, 155, 165);

  pdf.text(
    "Cempron Dental Clinic - Appointment Reference",
    center,
    275,
    { align: "center" }
  );

  const pdfBlob = pdf.output("blob");

  if (pdfBlob.size === 0) {
    throw new Error(
      "PDF generation failed: The document is empty."
    );
  }

  console.log(
    "Generated PDF Size:",
    pdfBlob.size
  );

  console.log(
    "Uploading appointment PDF...",
    filePath
  );

  const {
    data: uploadData,
    error: uploadError,
  } = await storage.upload(
    filePath,
    pdfBlob,
    {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    }
  );

  if (uploadError) {
    console.error(
      "Supabase Upload Error:",
      uploadError
    );

    const {
      data: retryFile,
      error: retryError,
    } = await storage.download(filePath);

    if (retryError || !retryFile || retryFile.size === 0) {
      throw new Error(
        "PDF upload failed: " +
          uploadError.message +
          ". Check your Supabase Storage INSERT policy."
      );
    }
  } else {
    console.log(
      "PDF uploaded:",
      uploadData.path
    );
  }

  const {
    data: verifiedFile,
    error: verificationError,
  } = await storage.download(filePath);

  if (verificationError || !verifiedFile) {
    throw new Error(
      "PDF file could not be verified in Supabase Storage: " +
        (verificationError?.message ||
          "Object not found.")
    );
  }

  if (verifiedFile.size === 0) {
    throw new Error(
      "The uploaded PDF file is empty."
    );
  }

  console.log(
    "PDF successfully verified."
  );

  const { data: urlData } =
    storage.getPublicUrl(filePath);

  const pdfUrl = urlData.publicUrl;

  if (!pdfUrl) {
    throw new Error(
      "Unable to generate appointment PDF URL."
    );
  }

  console.log(
    "Appointment PDF URL:",
    pdfUrl
  );

  return pdfUrl;
}
