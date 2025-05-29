
import { CONFIG } from '../config/constants.js';

export class ResponseGenerator {
  constructor() {
    this.templates = {
      // Success templates
      plansFound: {
        single: "Here's a {planType} plan {operatorText}{budgetText}{durationText}{sortText}:",
        multiple: "Here are {count} {planType} plans {operatorText}{budgetText}{durationText}{sortText}:",
        limited: "(Showing {shown} out of {total} available plans)"
      },
      
      // Alternative suggestions
      alternatives: {
        duration: "No exact {planType} plans with {duration} days validity{budgetText} found. Here are some alternatives:",
        budget: "No {planType} plans found under ₹{budget}. The cheapest available plan is ₹{minPrice}.",
        general: "No matching {planType} plans found{durationText}{budgetText}. Try adjusting your filters."
      },
      
      // Error scenarios
      noPlans: {
        operator: "No {planType} plans available for {operator}. Would you like to check {alternativePlanType} plans instead?",
        international: "No {operatorText}international roaming plans found. Please check the operator's website or customer care for international roaming activation and rates.",
        features: "No {operatorText}{planType} plans found with {features}.",
        general: "No {planType} plans found{operatorText}. Please try a different search."
      },
      
      // Special cases
      voiceOnly: "voice-only",
      correctionNote: "(Assuming you meant {corrected} instead of {original})",
      missingOperator: "Note: I don't have information on {operator} plans.",
      featureNote: "Note: None of these plans include {features}.",
      
      // Plan formatting
      planItem: "- {providerText}₹{price}: {data}{validityText}{benefits}"
    };
  }

  // Format a single plan item
  formatPlanItem(plan, showProvider = false) {
    const validity = this.formatValidity(plan.validity, plan.planType);
    const validityText = validity ? ` (${validity})` : '';
    const providerText = showProvider && plan.provider ? `[${plan.provider.toUpperCase()}] ` : '';
    const benefits = [plan.benefits, plan.additional_benefits].filter(Boolean).join(', ');
    const benefitsText = benefits ? ` ${benefits}` : '';

    return this.templates.planItem
      .replace('{providerText}', providerText)
      .replace('{price}', plan.price)
      .replace('{data}', plan.data)
      .replace('{validityText}', validityText)
      .replace('{benefits}', benefitsText);
  }

  // Format validity in a user-friendly way
  formatValidity(validity, planType) {
    if (!validity) {
      return planType === 'postpaid' ? 'monthly bill cycle' : '';
    }
    
    if (validity === 'base plan') return 'with base plan';
    if (validity === 'bill cycle' || validity === 'monthly') return 'monthly bill cycle';
    if (typeof validity === 'number') return `${validity} days`;
    return validity;
  }

  // Generate context strings for responses
  generateContextStrings(params) {
    const {
      operator,
      planType = 'prepaid',
      budget,
      targetDuration,
      isVoiceOnly = false,
      sortBy,
      correctedOperator,
      originalOperator,
      missingOperator
    } = params;

    let operatorText = '';
    let budgetText = '';
    let durationText = '';
    let sortText = '';
    let voiceText = '';
    let correctionMessage = '';
    let missingOperatorMessage = '';

    // Operator context
    if (operator) {
      operatorText = `${operator.toUpperCase()} `;
    }

    // Budget context
    if (budget) {
      budgetText = ` under ₹${budget}`;
    }

    // Duration context
    if (targetDuration) {
      durationText = ` with ${targetDuration} days validity`;
    }

    // Voice-only context
    if (isVoiceOnly) {
      voiceText = ' ' + this.templates.voiceOnly.toUpperCase();
    }

    // Sorting context
    if (sortBy === 'price') {
      sortText = ' (cheapest first)';
    } else if (sortBy === 'value') {
      sortText = ' (best value first)';
    }

    // Correction message
    if (correctedOperator && originalOperator) {
      correctionMessage = this.templates.correctionNote
        .replace('{corrected}', correctedOperator.toUpperCase())
        .replace('{original}', originalOperator.toUpperCase()) + ' ';
    }

    // Missing operator message
    if (missingOperator) {
      missingOperatorMessage = this.templates.missingOperator
        .replace('{operator}', missingOperator.toUpperCase()) + ' ';
    }

    return {
      operatorText,
      budgetText,
      durationText,
      voiceText,
      sortText,
      correctionMessage,
      missingOperatorMessage,
      planTypeText: planType.toUpperCase() + voiceText
    };
  }

  // Generate response for successful plan results
  generatePlansFoundResponse(plans, params) {
    const context = this.generateContextStrings(params);
    const plansToShow = plans.slice(0, CONFIG.MAX_PLANS_TO_SHOW);
    const showProvider = !params.operator; // Show provider only if no specific operator was requested

    let response = context.correctionMessage + context.missingOperatorMessage;

    // Add feature unavailability note if applicable
    if (params.unavailableFeatures && params.unavailableFeatures.length > 0) {
      response += this.templates.featureNote.replace('{features}', params.unavailableFeatures.join(' or ')) + '\n\n';
    }

    // Main heading
    const template = plansToShow.length === 1 ? this.templates.plansFound.single : this.templates.plansFound.multiple;
    response += template
      .replace('{count}', plansToShow.length)
      .replace('{planType}', context.planTypeText)
      .replace('{operatorText}', context.operatorText)
      .replace('{budgetText}', context.budgetText)
      .replace('{durationText}', context.durationText)
      .replace('{sortText}', context.sortText);

    response += '\n\n';

    // Format plan items
    response += plansToShow
      .map(plan => this.formatPlanItem(plan, showProvider))
      .join('\n');

    // Add limitation note if results were truncated
    if (plans.length > CONFIG.MAX_PLANS_TO_SHOW) {
      response += '\n\n' + this.templates.plansFound.limited
        .replace('{shown}', CONFIG.MAX_PLANS_TO_SHOW)
        .replace('{total}', plans.length);
    }

    return response;
  }

  // Generate response for alternative suggestions
  generateAlternativesResponse(alternativePlans, params) {
    const context = this.generateContextStrings(params);
    const showProvider = !params.operator;

    let response = context.correctionMessage + context.missingOperatorMessage;

    // Alternative suggestions heading
    if (params.targetDuration) {
      response += this.templates.alternatives.duration
        .replace('{planType}', context.planTypeText)
        .replace('{duration}', params.targetDuration)
        .replace('{budgetText}', context.budgetText);
    } else {
      response += this.templates.alternatives.general
        .replace('{planType}', context.planTypeText)
        .replace('{durationText}', context.durationText)
        .replace('{budgetText}', context.budgetText);
    }

    response += '\n\n';

    // Format alternative plans
    response += alternativePlans
      .map(plan => this.formatPlanItem(plan, showProvider))
      .join('\n');

    return response;
  }

  // Generate response when no plans are found
  generateNoPlansResponse(params, availablePlans = []) {
    const context = this.generateContextStrings(params);
    let response = context.correctionMessage + context.missingOperatorMessage;

    if (params.requestedFeatures && params.requestedFeatures.length > 0) {
      // No plans with requested features
      response += this.templates.noPlans.features
        .replace('{operatorText}', context.operatorText)
        .replace('{planType}', context.planTypeText)
        .replace('{features}', params.requestedFeatures.join(' and '));
    } else if (params.isInternationalQuery) {
      // No international roaming plans
      response += this.templates.noPlans.international
        .replace('{operatorText}', context.operatorText);
    } else if (params.budget && availablePlans.length > 0) {
      // Budget constraint issue
      const minPrice = Math.min(...availablePlans.map(p => p.price));
      response += this.templates.alternatives.budget
        .replace('{planType}', context.planTypeText)
        .replace('{budget}', params.budget)
        .replace('{minPrice}', minPrice);
    } else if (availablePlans.length > 0) {
      // General filtering issue
      response += this.templates.alternatives.general
        .replace('{planType}', context.planTypeText)
        .replace('{durationText}', context.durationText)
        .replace('{budgetText}', context.budgetText);
      
      if (params.targetDuration || params.budget) {
        response += ' Try adjusting your filters.';
      }
    } else {
      // No plans for operator/type at all
      const alternativePlanType = params.planType === 'prepaid' ? 'postpaid' : 'prepaid';
      response += this.templates.noPlans.operator
        .replace('{planType}', context.planTypeText)
        .replace('{operator}', params.operator ? params.operator.toUpperCase() : 'any operator')
        .replace('{alternativePlanType}', alternativePlanType);
    }

    return response;
  }

  // Generate conversational responses
  generateConversationalResponse(queryText) {
    const normalizedQuery = queryText.toLowerCase().trim();
    
    for (const [trigger, responses] of Object.entries(CONFIG.CONVERSATIONAL_RESPONSES)) {
      if (normalizedQuery.includes(trigger)) {
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        return randomResponse;
      }
    }
    
    return null; // No conversational response found
  }

  // Main method to generate appropriate response
  generateResponse(params) {
    const {
      plans = [],
      filteredPlans = [],
      alternativePlans = [],
      queryText = '',
      isConversational = false
    } = params;

    // Handle conversational queries first
    if (isConversational) {
      const conversationalResponse = this.generateConversationalResponse(queryText);
      if (conversationalResponse) {
        return conversationalResponse;
      }
    }

    // Handle plan-related responses
    if (filteredPlans.length > 0) {
      return this.generatePlansFoundResponse(filteredPlans, params);
    } else if (alternativePlans.length > 0) {
      return this.generateAlternativesResponse(alternativePlans, params);
    } else {
      return this.generateNoPlansResponse(params, plans);
    }
  }
}

// Export singleton instance
export const responseGenerator = new ResponseGenerator();
