const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Institution = require('./src/models/Institution');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Import institutions from CSV
const importInstitutions = async (csvFilePath) => {
  const institutions = [];
  let successCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        // Parse CSV row
        const institution = {
          name: row.name.trim(),
          displayName: row.displayName.trim(),
          description: row.description?.trim() || '',
          website: row.website?.trim() || '',
          logo: row.logo?.trim() || '',
          address: {
            district: row.district?.trim() || '',
            state: row.state?.trim() || ''
          },
          contactInfo: {
            email: row.email?.trim().toLowerCase() || '',
            phone: row.phone?.trim() || ''
      fs.createReadStream(csvFilePath)
          status: 'ACTIVE', // Always active so users can see them
          kycVerified: false, // Not verified until claimed and approved
          claimed: false, // Not claimed yet
          claimStatus: 'UNCLAIMED',
          importedFromCSV: true,
          createdByUser: false // CSV imported by admin
              // claimStatus: 'UNCLAIMED', // Removed obsolete claimStatus

        institutions.push(institution);
      })
      .on('end', async () => {
        console.log(`\n📊 Parsed ${institutions.length} institutions from CSV\n`);

        // Import each institution
        for (const instData of institutions) {
          try {
            // Check if institution already exists
            const existing = await Institution.findOne({ 
              name: instData.name 
            });

            if (existing) {
              console.log(`⚠️  Skipped (duplicate): ${instData.name}`);
              duplicateCount++;
              continue;
            }

            // Create institution
            const institution = new Institution(instData);
            await institution.save();
            
            console.log(`✅ Imported: ${instData.name}`);
            successCount++;

          } catch (error) {
            console.error(`❌ Error importing ${instData.name}:`, error.message);
            errorCount++;
          }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📋 IMPORT SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Successfully imported: ${successCount}`);
        console.log(`⚠️  Duplicates skipped: ${duplicateCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📊 Total processed: ${institutions.length}`);
        console.log('='.repeat(60) + '\n');

        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Main execution
const main = async () => {
  try {
    // Get CSV file path from command line argument
    const csvFilePath = process.argv[2] || './institution_import_template.csv';

    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ CSV file not found: ${csvFilePath}`);
      console.log('\nUsage: node importInstitutions.js <path-to-csv-file>');
      console.log('Example: node importInstitutions.js ./institutions.csv\n');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏛️  INSTITUTION BULK IMPORT');
    console.log('='.repeat(60));
    console.log(`📁 CSV File: ${csvFilePath}`);
    console.log('='.repeat(60) + '\n');

    // Connect to database
    await connectDB();

    // Import institutions
    await importInstitutions(csvFilePath);

    // Disconnect
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
};

// Run the script
main();
