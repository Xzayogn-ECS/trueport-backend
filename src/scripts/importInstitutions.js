/**
 * Import Institutions from CSV
 * 
 * Usage: node scripts/importInstitutions.js path/to/institutions.csv
 * 
 * CSV Format:
 * name,displayName,description,website,logo,district,state,email,phone
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const Institution = require('../models/Institution');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Import institutions from CSV
const importInstitutions = async (csvFilePath) => {
  const results = [];
  const errors = [];
  let lineNumber = 1; // Start at 1 for header

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        lineNumber++;
        try {
          // Validate required fields
          if (!data.name || !data.displayName || !data.district || !data.state) {
            errors.push({
              line: lineNumber,
              error: 'Missing required fields (name, displayName, district, state)',
              data
            });
            return;
          }

          // Prepare institution object
          const institution = {
            name: data.name.trim(),
            displayName: data.displayName.trim(),
            description: data.description?.trim() || '',
            website: data.website?.trim() || '',
            logo: data.logo?.trim() || '',
            address: {
              district: data.district.trim(),
              state: data.state.trim()
            },
            contactInfo: {
              email: data.email?.trim().toLowerCase() || '',
              phone: data.phone?.trim() || ''
            },
            status: 'ACTIVE',
            claimed: false,
            kycVerified: false,
            importedFromCSV: true,
            createdByUser: false
          };

          results.push(institution);
        } catch (error) {
          errors.push({
            line: lineNumber,
            error: error.message,
            data
          });
        }
      })
      .on('end', () => {
        resolve({ results, errors });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Main execution
const main = async () => {
  try {
    // Get CSV file path from command line arguments
    const csvFilePath = process.argv[2];

    if (!csvFilePath) {
      console.error('❌ Error: Please provide a CSV file path');
      console.log('Usage: node scripts/importInstitutions.js path/to/institutions.csv');
      process.exit(1);
    }

    // Check if file exists
    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ Error: File not found: ${csvFilePath}`);
      process.exit(1);
    }

    console.log('📂 Reading CSV file:', csvFilePath);
    console.log('');

    // Connect to database
    await connectDB();

    // Parse CSV file
    console.log('📊 Parsing CSV data...');
    const { results, errors } = await importInstitutions(csvFilePath);

    // Display parsing errors
    if (errors.length > 0) {
      console.log('\n⚠️  Parsing Errors:');
      errors.forEach((error) => {
        console.log(`   Line ${error.line}: ${error.error}`);
        console.log(`   Data:`, error.data);
      });
      console.log('');
    }

    if (results.length === 0) {
      console.log('❌ No valid institutions found to import');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`✅ Parsed ${results.length} institutions from CSV`);
    console.log('');

    // Import to database
    console.log('💾 Importing to database...');
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const institutionData of results) {
      try {
        // Check if institution already exists
        const existing = await Institution.findOne({ name: institutionData.name });
        
        if (existing) {
          console.log(`   ⏭️  Skipped: "${institutionData.name}" (already exists)`);
          skipped++;
          continue;
        }

        // Create new institution
        const institution = new Institution(institutionData);
        await institution.save();
        
        console.log(`   ✅ Imported: "${institutionData.name}" - ${institutionData.address.district}, ${institutionData.address.state}`);
        imported++;
      } catch (error) {
        console.log(`   ❌ Failed: "${institutionData.name}" - ${error.message}`);
        failed++;
      }
    }

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('📊 Import Summary:');
    console.log('═══════════════════════════════════════════');
    console.log(`   ✅ Successfully imported: ${imported}`);
    console.log(`   ⏭️  Skipped (duplicates):  ${skipped}`);
    console.log(`   ❌ Failed:                ${failed}`);
    console.log(`   📄 Total in CSV:          ${results.length}`);
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    console.log('✨ Import completed!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

// Run the script
main();
