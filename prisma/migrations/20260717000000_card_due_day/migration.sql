-- Credit cards: the day of each month the bill falls due. Costs charged between
-- two consecutive due dates form one statement, payable on the closing due date.
ALTER TABLE "Account" ADD COLUMN "dueDay" INTEGER;
