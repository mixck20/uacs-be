const MedicalCertificate = require('../models/MedicalCertificate');
const Patient = require('../models/Patient');
const Notification = require('../models/Notification');
const { jsPDF } = require('jspdf');
const path = require('path');
const fs = require('fs');

// User: Request a medical certificate
exports.requestCertificate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { purpose, requestNotes, visitIds } = req.body;

    // Find patient record
    const patient = await Patient.findOne({ userId });
    if (!patient) {
      return res.status(404).json({ message: 'Patient record not found' });
    }

    // Validate that the selected visits exist in patient's records
    if (visitIds && visitIds.length > 0) {
      const validVisitIds = patient.visits
        .filter(visit => visitIds.includes(visit._id.toString()))
        .map(visit => visit._id.toString());
      
      if (validVisitIds.length === 0) {
        return res.status(400).json({ message: 'Invalid visit selections' });
      }
    }

    const certificate = new MedicalCertificate({
      userId,
      patientId: patient._id,
      visitIds: visitIds || [],
      purpose,
      requestNotes,
      status: 'pending'
    });

    await certificate.save();

    res.status(201).json({
      message: 'Medical certificate request submitted successfully',
      certificate
    });
  } catch (error) {
    console.error('Error requesting certificate:', error);
    res.status(500).json({ message: error.message });
  }
};

// User: Get my certificate requests
exports.getMyCertificates = async (req, res) => {
  try {
    const userId = req.user.id;
    const certificates = await MedicalCertificate.find({ userId })
      .populate('issuedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(certificates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Clinic: Get all certificate requests
exports.getAllCertificates = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const certificates = await MedicalCertificate.find(query)
      .populate('userId', 'name email')
      .populate('patientId', 'fullName')
      .populate('issuedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(certificates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Clinic: Issue/Approve certificate
exports.issueCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      diagnosis,
      validFrom,
      validUntil,
      recommendations
    } = req.body;

    const certificate = await MedicalCertificate.findById(id)
      .populate('userId', 'name email')
      .populate('patientId', 'fullName dateOfBirth gender');

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    certificate.status = 'issued';
    certificate.diagnosis = diagnosis;
    certificate.dateIssued = new Date();
    certificate.validFrom = validFrom;
    certificate.validUntil = validUntil;
    certificate.recommendations = recommendations;
    certificate.issuedBy = req.user.id;

    await certificate.save();

    // Send notification to user
    if (certificate.userId && certificate.userId._id) {
      await Notification.create({
        userId: certificate.userId._id,
        type: 'general',
        title: 'Medical Certificate Ready',
        message: 'Your medical certificate has been issued and is ready for download.',
        data: {
          certificateId: certificate._id,
          certificateNumber: certificate.certificateNumber
        }
      });
    }

    res.json({
      message: 'Certificate issued successfully',
      certificate
    });
  } catch (error) {
    console.error('Error issuing certificate:', error);
    res.status(500).json({ message: error.message });
  }
};

// Clinic: Reject certificate request
exports.rejectCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const certificate = await MedicalCertificate.findById(id)
      .populate('userId');

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    certificate.status = 'rejected';
    certificate.rejectionReason = rejectionReason;
    await certificate.save();

    // Send notification to user
    if (certificate.userId && certificate.userId._id) {
      await Notification.create({
        userId: certificate.userId._id,
        type: 'general',
        title: 'Medical Certificate Request Rejected',
        message: `Your medical certificate request has been rejected. Reason: ${rejectionReason}`,
        data: {
          certificateId: certificate._id
        }
      });
    }

    res.json({
      message: 'Certificate request rejected',
      certificate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate PDF for certificate
exports.generateCertificatePDF = async (req, res) => {
  try {
    const { id } = req.params;
    const certificate = await MedicalCertificate.findById(id)
      .populate('userId', 'name')
      .populate('patientId', 'fullName dateOfBirth gender')
      .populate('issuedBy', 'name');

    if (!certificate || certificate.status !== 'issued') {
      return res.status(404).json({ message: 'Certificate not found or not issued' });
    }

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = 30;

    // All text in black
    doc.setTextColor(0, 0, 0);

    // Try to add logo image
    const logoPath = path.join(__dirname, '../public/ua-logo.png');
    if (fs.existsSync(logoPath)) {
      try {
        const logoData = fs.readFileSync(logoPath, { encoding: 'base64' });
        doc.addImage(`data:image/png;base64,${logoData}`, 'PNG', margin, yPos - 10, 25, 25);
      } catch (error) {
        console.log('Could not load logo image:', error.message);
        // Fallback to text logo
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('UA', margin, yPos);
      }
    } else {
      // Fallback to text logo if image not found
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('UA', margin, yPos);
    }

    // Date at top right
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.text(`Date: ${currentDate}`, pageWidth - margin, 30, { align: 'right' });
    yPos += 35;

    // Header - MEDICAL CERTIFICATE
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MEDICAL CERTIFICATE', pageWidth / 2, yPos, { align: 'center' });
    yPos += 20;

    // Certificate body
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    // "This is to certify that"
    doc.text('This is to certify that', margin, yPos);
    yPos += 10;
    
    // Patient name with underline (left-aligned)
    doc.setFont('helvetica', 'bold');
    const patientName = certificate.patientId.fullName || 'N/A';
    doc.text(patientName, margin, yPos);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
    yPos += 12;

    // "was seen and examined..."
    doc.setFont('helvetica', 'normal');
    doc.text('was seen and examined at the college clinic and is advised to:', margin, yPos);
    yPos += 15;

    // Diagnosis section
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnosis:', margin, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    const diagnosis = certificate.diagnosis || 'N/A';
    const splitDiag = doc.splitTextToSize(diagnosis, pageWidth - (margin * 2));
    doc.text(splitDiag, margin, yPos);
    yPos += (splitDiag.length * 6) + 10;

    // Recommendations section
    doc.setFont('helvetica', 'bold');
    doc.text('Recommendations:', margin, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    const recommendations = certificate.recommendations || 'Rest and recovery';
    const splitRecs = doc.splitTextToSize(recommendations, pageWidth - (margin * 2));
    doc.text(splitRecs, margin, yPos);
    yPos += (splitRecs.length * 6) + 40;

    // Signature section - aligned to right
    const sigStartX = pageWidth - margin - 60;
    doc.line(sigStartX, yPos, pageWidth - margin, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('University Physician', pageWidth - margin, yPos, { align: 'right' });
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('License No. _______________', pageWidth - margin, yPos, { align: 'right' });
    yPos += 6;
    doc.text('PTR No. _______________', pageWidth - margin, yPos, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('University of the Assumption - College Clinic', pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.text(`Certificate No: ${certificate.certificateNumber}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
    doc.text(`Issued: ${new Date(certificate.dateIssued || certificate.issuedAt).toLocaleDateString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Send PDF
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=medical-certificate-${certificate.certificateNumber}.pdf`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: error.message });
  }
};
