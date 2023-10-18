  @Mutation((returns) => PaymentInformation)
  async generate_payment_information(
    @Args({ name: 'student_id', type: () => ID }) student_id,
    @Args({ name: 'pay_till_installment', type: () => Number })
    pay_till_installment,
    @Args({ name: 'selected_discounts', type: () => [ID] }) selected_discounts,
    @Context() context,
    @Args({ name: 'isOnline', type: () => Boolean, nullable: true })
    isOnline = false,
  ) {
    const student = await this.student(student_id, context);
    const school = await this.databaseService.schoolModel.findById(
      student.school_id,
    );
    const all_installments = await this.installments(student);
    const paid_till_installment = all_installments.findIndex((installment) => {
      return !installment.applicable_fee_heads.every(
        (fee_head) => fee_head.paid,
      );
    });
    const fines = await this.individual_fines(student);
    const absolute_discounts = await this.absolute_discounts(student);
    const unpaid_absolute_discounts = absolute_discounts.filter(
      (discount) => !discount.availed,
    );
    const unpaid_fines = fines.filter((fine) => !fine.is_paid);
    let installments_to_pay = [];
    if (student.previous_session_dues > 0) {
      const psd_installment: Installment = {
        due_date: new Date(school.createdAt),
        discounts: [] as any,
        applicable_fee_heads: [],
        to_pay:
          student.previous_session_dues -
          (isOnline ? school.convenience_fee || 30 : 0),
        fine: 0,
        installment_summary: {
          total_fee_heads:
            student.previous_session_dues -
            (isOnline ? school.convenience_fee || 30 : 0),
          total_late_fine_amount: 0,
          total_late_fine_days: 0,
          total_one_time_fine: 0,
          late_fine_per_day: 0,
        },
        applicable_late_fine: {
          installment_due_date: new Date(school.createdAt),
          sum: 0,
          amounts: [],
        },
      };
      installments_to_pay.push(psd_installment);
    }
    const _installments_to_pay = all_installments.slice(
      paid_till_installment,
      pay_till_installment,
    );
    installments_to_pay = [...installments_to_pay, ..._installments_to_pay];
    let amount = 0;
    amount += unpaid_fines.reduce((acc, fine) => acc + fine.amount, 0);
    amount += installments_to_pay.reduce(
      (acc, installment) =>
        acc +
        installment.to_pay +
        (isOnline ? school.convenience_fee || 30 : 0),
      0,
    );
    let sum = 0;
    const applied_discounts = unpaid_absolute_discounts
      .sort((a, b) => {
        return b.discount.value - a.discount.value;
      })
      .filter((discount) => {
        if (discount.availed) return false;
        if (discount.discount.value > amount) return false;
        sum += discount.discount.value;
        return sum <= amount;
      });
    amount -= applied_discounts.reduce(
      (acc, discount) => acc + discount.discount.value,
      0,
    );
    return {
      unpaid_fines,
      amount,
      applied_discounts,
      student,
      installments_to_pay,
    };
  }
