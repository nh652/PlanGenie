
export const mockPlansData = {
  telecom_providers: {
    jio: {
      plans: {
        prepaid: {
          data_plans: [
            {
              name: "₹149 Plan",
              price: "149",
              data: "2GB",
              validity: "28 days",
              benefits: "Unlimited voice calls, 300 SMS",
              additional_benefits: "Jio Apps"
            },
            {
              name: "₹399 Plan", 
              price: "399",
              data: "6GB",
              validity: "56 days",
              benefits: "Unlimited voice calls, 1000 SMS",
              additional_benefits: "Disney+ Hotstar Mobile"
            },
            {
              name: "₹555 Plan",
              price: "555",
              data: "Unlimited",
              validity: "84 days",
              benefits: "Unlimited voice calls, 100 SMS/day",
              additional_benefits: "Netflix Mobile, Amazon Prime"
            }
          ],
          voice_plans: [
            {
              name: "₹99 Voice Plan",
              price: "99",
              data: "0GB",
              validity: "28 days",
              benefits: "Unlimited voice calls, 300 SMS",
              additional_benefits: "No data included"
            }
          ]
        },
        postpaid: [
          {
            name: "₹399 Postpaid",
            price: "399",
            data: "75GB",
            validity: "30 days",
            benefits: "Unlimited voice calls, 100 SMS/day",
            additional_benefits: "Netflix, Amazon Prime, Disney+ Hotstar"
          }
        ]
      }
    },
    airtel: {
      plans: {
        prepaid: {
          data_plans: [
            {
              name: "₹179 Plan",
              price: "179",
              data: "2GB",
              validity: "28 days",
              benefits: "Unlimited voice calls, 300 SMS",
              additional_benefits: "Airtel Thanks benefits"
            },
            {
              name: "₹699 International Plan",
              price: "699",
              data: "4GB",
              validity: "28 days",
              benefits: "Unlimited voice calls, 100 SMS/day",
              additional_benefits: "International roaming enabled, Netflix"
            }
          ]
        },
        postpaid: [
          {
            name: "₹499 Postpaid",
            price: "499", 
            data: "100GB",
            validity: "30 days",
            benefits: "Unlimited voice calls, 100 SMS/day",
            additional_benefits: "International roaming, Netflix, Amazon Prime"
          }
        ]
      }
    },
    vi: {
      plans: {
        prepaid: {
          data_plans: [
            {
              name: "₹199 Plan",
              price: "199",
              data: "1.5GB",
              validity: "28 days", 
              benefits: "Unlimited voice calls, 300 SMS",
              additional_benefits: "Vi Movies & TV"
            }
          ]
        },
        postpaid: [
          {
            name: "₹399 Postpaid",
            price: "399",
            data: "40GB", 
            validity: "30 days",
            benefits: "Unlimited voice calls, 100 SMS/day",
            additional_benefits: "Netflix, Amazon Prime"
          }
        ]
      }
    }
  }
};

export const mockEmptyPlansData = {
  telecom_providers: {
    jio: {
      plans: {
        prepaid: {},
        postpaid: []
      }
    }
  }
};

export const mockInvalidPlansData = {
  invalid_structure: true
};
