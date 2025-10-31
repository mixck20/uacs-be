const MedicalCertificate = require('../models/MedicalCertificate');
const Patient = require('../models/Patient');
const Notification = require('../models/Notification');
const { jsPDF } = require('jspdf');

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
      .populate('patientId', 'fullName studentId')
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
      .populate('patientId', 'fullName studentId dateOfBirth gender');

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
    await Notification.create({
      userId: certificate.userId._id,
      type: 'general',
      title: 'Medical Certificate Request Rejected',
      message: `Your medical certificate request has been rejected. Reason: ${rejectionReason}`,
      data: {
        certificateId: certificate._id
      }
    });

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
      .populate('patientId', 'fullName studentId dateOfBirth gender')
      .populate('issuedBy', 'name');

    if (!certificate || certificate.status !== 'issued') {
      return res.status(404).json({ message: 'Certificate not found or not issued' });
    }

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 30;

    // Date at top right
    doc.setFontSize(10);
    doc.setTextColor(60);
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.text(`Date: ${currentDate}`, 20, yPos);
    yPos += 20;

    // Header - Medical Certificate
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(229, 29, 94); // Pink color
    doc.text('MEDICAL CERTIFICATE', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Certificate body
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40);
    
    doc.text('This is to certify that', 20, yPos);
    yPos += 8;
    
    // Patient name with underline
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const patientName = certificate.patientId.fullName || 'N/A';
    doc.text(patientName, 20, yPos);
    doc.setLineWidth(0.5);
    doc.line(20, yPos + 2, pageWidth - 20, yPos + 2);
    yPos += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Was seen and examined at the college clinic due to:', 20, yPos);
    yPos += 8;

    // Reason - from purpose
    const reason = certificate.purpose || 'Medical consultation';
    doc.text(reason, 20, yPos);
    doc.line(20, yPos + 2, pageWidth - 20, yPos + 2);
    yPos += 12;

    // Diagnosis
    doc.text('Diagnosis:', 20, yPos);
    yPos += 8;
    const diagnosis = certificate.diagnosis || 'N/A';
    doc.text(diagnosis, 20, yPos);
    doc.line(20, yPos + 2, pageWidth - 20, yPos + 2);
    yPos += 12;

    // Recommendations
    doc.text('Recommendations:', 20, yPos);
    yPos += 8;
    const recommendations = certificate.recommendations || 'Rest and recovery';
    const splitRecs = doc.splitTextToSize(recommendations, pageWidth - 40);
    doc.text(splitRecs, 20, yPos);
    yPos += (splitRecs.length * 6) + 2;
    doc.line(20, yPos, pageWidth - 20, yPos);
    yPos += 25;

    // Signature section
    doc.setFont('helvetica', 'normal');
    doc.text('_____________________________', pageWidth / 2 + 20, yPos, { align: 'center' });
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('University Physician', pageWidth / 2 + 20, yPos, { align: 'center' });
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('License no. __________________', pageWidth / 2 + 20, yPos, { align: 'center' });
    yPos += 5;
    doc.text('PTR no. __________________', pageWidth / 2 + 20, yPos, { align: 'center' });
    yPos += 15;

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('University of the Assumption - UA Clinic System', pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.text(`Certificate No: ${certificate.certificateNumber}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
    doc.text(`Issued: ${new Date(certificate.issuedAt).toLocaleDateString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

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
